package tvm

import (
	"context"
	"fmt"
	"github.com/certusone/wormhole/node/pkg/common"
	"github.com/certusone/wormhole/node/pkg/p2p"
	gossipv1 "github.com/certusone/wormhole/node/pkg/proto/gossip/v1"
	"github.com/certusone/wormhole/node/pkg/readiness"
	"github.com/certusone/wormhole/node/pkg/supervisor"
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

	readiness.SetReady(e.readinessSync)

	supervisor.Signal(ctx, supervisor.SignalHealthy)

	common.RunWithScissors(ctx, errC, "ton_core_events", func(ctx context.Context) error {
		for {
			select {
			case <-ctx.Done():
				logger.Error("coreEvents context done")
				return ctx.Err()
			case msg := <-trxChan:
				err = e.inspectBody(logger, msg, false)
				if err != nil {
					p2p.DefaultRegistry.AddErrorCount(e.chainID, 1)
					errC <- err //nolint:channelcheck // The watcher will exit anyway
					return err
				}
			}
		}
	})

	common.RunWithScissors(ctx, errC, "ton_block_height", func(ctx context.Context) error {
		for {
			select {
			case <-ctx.Done():
				logger.Error("ton_block_height context done")
				return ctx.Err()

			case <-timer.C:
				height, err := e.GetLastSeqNoFromBlockchain(ctx)
				if err != nil {
					logger.Error("Failed to get latest seqno", zap.Error(err))
				} else {
					currentHeight.Set(float64(height))
					logger.Debug("ton_getLatestSeqno", zap.Int64("result", int64(height)))

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
			case r := <-e.obsvReqC:
				if r.ChainId > math.MaxUint16 || vaa.ChainID(r.ChainId) != vaa.ChainIDTon {
					panic("invalid chain ID")
				}

				txData, err := e.GetTransactionByReobserveRequest(ctx, r.TxHash)
				if err != nil {
					logger.Error("Failed to get transaction by reobserve", zap.Error(err))
					p2p.DefaultRegistry.AddErrorCount(vaa.ChainIDTon, 1)
					return fmt.Errorf("failed to get transaction by reobserve: %w", err)
				}

				err = e.inspectBody(logger, txData, true)
				if err != nil {
					logger.Info("ton_fetch_obvs_req skipping event data in result", zap.Error(err))
				}
			}
		}
	})

	select {
	case <-ctx.Done():
		// Close socket(s), if necessary
		return ctx.Err()
	case err := <-errC:
		// Close socket(s), if necessary
		return err
	}
}
