package tvm

import (
	"context"
	"fmt"
	"github.com/certusone/wormhole/node/pkg/common"
	"github.com/certusone/wormhole/node/pkg/p2p"
	gossipv1 "github.com/certusone/wormhole/node/pkg/proto/gossip/v1"
	"github.com/certusone/wormhole/node/pkg/readiness"
	"github.com/certusone/wormhole/node/pkg/supervisor"
	"github.com/certusone/wormhole/node/pkg/watchers"
	"github.com/wormhole-foundation/wormhole/sdk/vaa"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"go.uber.org/zap"
	"math"
	"time"
)

type Watcher struct {
	chainID         vaa.ChainID
	chainRPC        string
	isTestnet       bool
	contractAddress *address.Address
	LastProcessedLT uint64                              // Last processed Logical Time (LT) of a transaction
	msgChan         chan<- *common.MessagePublication   // The following is the channel for emitting observations
	obsvReqC        <-chan *gossipv1.ObservationRequest // The following is the channel for receiving re-observation requests
	readinessSync   readiness.Component                 // Used to report the health of the watcher
	Subscriber      *TxSubscriber
}

func NewWatcher(
	chainID vaa.ChainID,
	chainRPC string,
	isTestnet bool,
	contractAddress *address.Address,
	msgChan chan<- *common.MessagePublication,
	obsvReqC <-chan *gossipv1.ObservationRequest,
) *Watcher {
	return &Watcher{
		chainID:         chainID,
		chainRPC:        chainRPC,
		isTestnet:       isTestnet,
		msgChan:         msgChan,
		obsvReqC:        obsvReqC,
		contractAddress: contractAddress,
		readinessSync:   common.MustConvertChainIdToReadinessSyncing(chainID),
	}
}

func (e *Watcher) Run(ctx context.Context) error {
	logger := supervisor.Logger(ctx)

	p2p.DefaultRegistry.SetNetworkStats(e.chainID, &gossipv1.Heartbeat_Network{
		ContractAddress: e.contractAddress.String(),
	})

	logger.Info("Starting watcher",
		zap.String("watcher_name", "ton"),
		zap.String("networkID", e.chainID.String()),
	)

	var err error

	lt, err := e.GetLastLTFromBlockchain(ctx)
	if err != nil {
		return fmt.Errorf("failed to get last LT: %w", err)
	}

	trxChan := make(chan *tlb.Transaction)

	e.Subscriber, err = NewTxSubscriber(e.contractAddress, lt, e.isTestnet, trxChan, logger)
	if err != nil {
		return fmt.Errorf("failed to create tx subscriber: %w", err)
	}

	if err = e.Subscriber.Work(ctx); err != nil {
		logger.Error("failed to start subscriber", zap.Error(err))
		return fmt.Errorf("failed to start subscriber: %w", err)
	}

	//Timer for the get_block_height go routine
	timer := time.NewTicker(time.Second * 1)
	defer timer.Stop()

	errC := make(chan error)
	defer close(errC)

	// Signal that basic initialization is complete
	readiness.SetReady(e.readinessSync)

	// Signal to the supervisor that this runnable has finished initialization
	supervisor.Signal(ctx, supervisor.SignalHealthy)

	common.RunWithScissors(ctx, errC, "ton_core_events", func(ctx context.Context) error {
		for {
			select {
			case err := <-errC:
				logger.Error("core_events died", zap.Error(err))
				return fmt.Errorf("core_events died: %w", err)
			case <-ctx.Done():
				logger.Error("coreEvents context done")
				return ctx.Err()
			case msg := <-e.Subscriber.outChan:
				err = e.inspectBody(logger, msg, false)
				if err != nil {
					p2p.DefaultRegistry.AddErrorCount(e.chainID, 1)
					errC <- err //nolint:channelcheck // The watcher will exit anyway
					return err
				}
			default:

				// Read events and handle them here
				// If this is a blocking read, then set readiness in the
				// get_block_height thread. Else, uncomment the following line:
				// readiness.SetReady()
			}
		}
	})

	common.RunWithScissors(ctx, errC, "ton_block_height", func(ctx context.Context) error {
		for {
			select {

			case err := <-errC:
				logger.Error("get_block_height died", zap.Error(err))
				return fmt.Errorf("get_block_height died: %w", err)

			case <-ctx.Done():
				logger.Error("ton_block_height context done")
				return ctx.Err()

			case <-timer.C:
				height, err := e.GetLastLTFromBlockchain(ctx)
				if err != nil {
					logger.Error("Failed to get latest tl", zap.Error(err))
				} else {
					currentHeight.Set(float64(height))
					logger.Debug("ton_getLatestTL", zap.Int64("result", int64(height)))

					p2p.DefaultRegistry.SetNetworkStats(e.chainID, &gossipv1.Heartbeat_Network{
						Height:          int64(height),
						ContractAddress: e.contractAddress.String(),
					})
				}

				readiness.SetReady(e.readinessSync)
			}
		}
	})

	common.RunWithScissors(ctx, errC, "ton_fetch_obvs_req", func(ctx context.Context) error {
		for {
			select {
			case <-ctx.Done():
				logger.Error("ton_fetch_obvs_req context done")
				return ctx.Err()
			case err := <-errC:
				logger.Error("ton_fetch_obvs_req died", zap.Error(err))
				return fmt.Errorf("ton_fetch_obvs_req died: %w", err)
			case r := <-e.obsvReqC:
				if r.ChainId > math.MaxUint16 || vaa.ChainID(r.ChainId) != vaa.ChainIDTon {
					panic("invalid chain ID")
				}

				txData, err := e.GetTransactionByReobserveRequest(ctx, r.TxHash)
				if err != nil {
					logger.Error("Failed to get transaction by reobserve", zap.Error(err))
					p2p.DefaultRegistry.AddErrorCount(vaa.ChainIDTon, 1)
					return fmt.Errorf("Failed to get transaction by reobserve: %w", err)
				}

				err = e.inspectBody(logger, txData, true)
				if err != nil {
					logger.Info("Failed to get transaction by reobserve", zap.Error(err))
				}
			}
		}
	})

	// This is done at the end of the Run function to cleanup as needed
	// and return the reason for Run() returning.
	select {
	case <-ctx.Done():
		// Close socket(s), if necessary
		return ctx.Err()
	case err := <-errC:
		// Close socket(s), if necessary
		return err
	}
}

func (e *Watcher) GetLastLTFromBlockchain(ctx context.Context) (uint64, error) {
	block, err := e.Subscriber.tonClient.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("CurrentMasterchainInfo: %w", err)
	}

	acc, err := e.Subscriber.tonClient.GetAccount(context.Background(), block, e.contractAddress)
	if err != nil {
		return 0, fmt.Errorf("e.tonClient.GetAccount: %w", err)
	}

	return acc.LastTxLT, nil
}

func (e *Watcher) inspectBody(logger *zap.Logger, tx *tlb.Transaction, isReobservation bool) error {
	externalMessageFields, err := getExternalMessageFields(tx)
	if err != nil {
		logger.Error("failed to unmarshal external message fields", zap.Error(err))
		p2p.DefaultRegistry.AddErrorCount(vaa.ChainIDTon, 1)
		return fmt.Errorf("getExternalMessageFields: %w", err)
	}

	if externalMessageFields.OPCode != OpCodeMessageNeeded {
		logger.Info("op mismatch", zap.Int("e.OPCodeNeeded", OpCodeMessageNeeded), zap.Int("OPCodeReceived", int(externalMessageFields.OPCode)))
		return nil
	}

	emitterAddress, err := vaa.StringToAddress(externalMessageFields.EmitterAddress.String())
	if err != nil {
		return fmt.Errorf("vaa.StringToAddress(externalMessageFields.EmitterAddress): %w", err)
	}

	observation := &common.MessagePublication{
		TxID:             tx.Hash,
		Timestamp:        time.Unix(int64(tx.Now), 0),
		Nonce:            externalMessageFields.Nonce,
		Sequence:         externalMessageFields.Sequence,
		EmitterChain:     e.chainID,
		EmitterAddress:   emitterAddress,
		Payload:          []byte(externalMessageFields.Payload.String()),
		ConsistencyLevel: externalMessageFields.ConsistencyLevel,
		IsReobservation:  isReobservation,
	}

	messagesConfirmed.Inc()
	if isReobservation {
		watchers.ReobservationsByChain.WithLabelValues("ton", "std").Inc()
	}

	logger.Info("message observed",
		zap.String("txHash", observation.TxIDString()),
		zap.Time("timestamp", observation.Timestamp),
		zap.Uint32("nonce", observation.Nonce),
		zap.Uint64("sequence", observation.Sequence),
		zap.Stringer("emitter_chain", observation.EmitterChain),
		zap.Stringer("emitter_address", observation.EmitterAddress),
		zap.Binary("payload", observation.Payload),
		zap.Uint8("consistencyLevel", observation.ConsistencyLevel),
	)

	e.msgChan <- observation //nolint:channelcheck // The channel to the processor is buffered and shared across chains, if it backs up we should stop processing new observations

	return nil
}
