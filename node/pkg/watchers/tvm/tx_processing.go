package tvm

import (
	"context"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/certusone/wormhole/node/pkg/common"
	"github.com/certusone/wormhole/node/pkg/p2p"
	"github.com/certusone/wormhole/node/pkg/watchers"
	"github.com/wormhole-foundation/wormhole/sdk/vaa"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"go.uber.org/zap"
)

type TxSubscriber struct {
	tonClient *ton.APIClient
	addr      *address.Address
	lt        uint64
	outChan   chan *tlb.Transaction
	logger    *zap.Logger
	isTestnet bool
}

func NewTxSubscriber(
	addr *address.Address,
	lt uint64,
	isTestnet bool,
	outChan chan *tlb.Transaction,
	logger *zap.Logger,
) (*TxSubscriber, error) {
	configURL := getConfigURL(isTestnet)

	pool := liteclient.NewConnectionPool()

	err := pool.AddConnectionsFromConfigUrl(context.Background(), configURL)
	if err != nil {
		return nil, fmt.Errorf("failed to load config from `%s`: %v", configURL, err)
	}

	api := ton.NewAPIClient(pool).WithRetry(5)
	return &TxSubscriber{
		tonClient: api.(*ton.APIClient),
		addr:      addr,
		lt:        lt,
		outChan:   outChan,
		logger:    logger,
	}, nil
}

func (ts *TxSubscriber) Work(ctx context.Context) (err error) {
	ts.logger.Info("Start listening to txs",
		zap.String("chainID", ts.addr.String()),
		zap.String("component", "TxSubscriber"),
		zap.String("addr", ts.addr.String()),
		zap.Uint64("start_tx_lt", ts.lt),
	)

	defer ts.logFinishWork(err)

	go ts.tonClient.SubscribeOnTransactions(ctx, ts.addr, ts.lt, ts.outChan)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case tx, ok := <-ts.outChan:
			if !ok {
				return nil
			}

			ts.logger.Info("Received transaction",
				zap.String("chainID", ts.addr.String()),
				zap.String("component", "TxSubscriber"),
				zap.String("address", ts.addr.String()),
				zap.String("tx_hash", hex.EncodeToString(tx.Hash)),
			)

			ts.outChan <- tx
		}
	}
}

const (
	MainnetConfigURL    = "https://ton.org/global.config.json"
	TestnetConfigURL    = "https://ton.org/testnet-global.config.json"
	OpCodeMessageNeeded = 0xee3a207e
)

// event::message_published#ee3a207e sender:MsgAddressInt sequence:uint64 nonce:uint32 payload:^Cell consistency_level:uint8
type ExternalMessageModel struct {
	TransactionID    []byte
	OPCode           uint32
	EmitterAddress   *address.Address
	Sequence         uint64
	Nonce            uint32
	Payload          *cell.Cell
	ConsistencyLevel uint8
}

func (e *Watcher) GetLastLTFromBlockchain(ctx context.Context) (uint64, error) {
	block, err := e.Subscriber.tonClient.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("CurrentMasterchainInfo: %w", err)
	}

	acc, err := e.Subscriber.tonClient.GetAccount(ctx, block, e.contractAddress)
	if err != nil {
		return 0, fmt.Errorf("e.tonClient.GetAccount: %w", err)
	}

	return acc.LastTxLT, nil
}

func (e *Watcher) GetLastSeqNoFromBlockchain(ctx context.Context) (uint32, error) {
	block, err := e.Subscriber.tonClient.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("CurrentMasterchainInfo: %w", err)
	}

	return block.SeqNo, nil
}

func (e *Watcher) inspectBody(logger *zap.Logger, tx *tlb.Transaction, isReobservation bool) error {
	externalMessageFields, err := getExternalMessageFields(tx)
	if err != nil {
		logger.Error("failed to unmarshal external message fields", zap.Error(err))
		p2p.DefaultRegistry.AddErrorCount(vaa.ChainIDTON, 1)
		return fmt.Errorf("getExternalMessageFields: %w", err)
	}

	if externalMessageFields.OPCode != OpCodeMessageNeeded {
		logger.Info("op mismatch", zap.Int("e.OPCodeNeeded", OpCodeMessageNeeded), zap.Int("OPCodeReceived", int(externalMessageFields.OPCode)))
		return nil
	}

	emitterAddress, err := vaa.StringToAddress(hex.EncodeToString(externalMessageFields.EmitterAddress.Data()))
	if err != nil {
		return fmt.Errorf("vaa.StringToAddress(externalMessageFields.EmitterAddress): %w", err)
	}

	observation := &common.MessagePublication{
		TxID:             externalMessageFields.TransactionID,
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

func getExternalMessageFields(tx *tlb.Transaction) (ExternalMessageModel, error) {
	//ignore such cases
	if tx == nil || tx.IO.Out == nil {
		return ExternalMessageModel{}, nil
	}

	messages, err := tx.IO.Out.ToSlice()
	if err != nil {
		return ExternalMessageModel{}, fmt.Errorf("tx.IO.Out.ToSlice: %w", err)
	}

	//ignore such cases
	if len(messages) == 0 {
		return ExternalMessageModel{}, nil
	}

	message := messages[0].Msg.Payload().BeginParse()

	opCode, err := message.LoadUInt(32)
	if err != nil {
		return ExternalMessageModel{}, fmt.Errorf("failed to load opcode")
	}

	emitterAddress, err := message.LoadAddr()
	if err != nil {
		return ExternalMessageModel{}, fmt.Errorf("failed to load emitter address")
	}

	if emitterAddress == nil {
		return ExternalMessageModel{}, fmt.Errorf("emitter address is nil")
	}

	sequence, err := message.LoadUInt(64)
	if err != nil {
		return ExternalMessageModel{}, fmt.Errorf("failed to load sequence")
	}

	nonce, err := message.LoadUInt(32)
	if err != nil {
		return ExternalMessageModel{}, fmt.Errorf("failed to load nonce")
	}

	payload, err := message.LoadRefCell()
	if err != nil {
		return ExternalMessageModel{}, fmt.Errorf("failed to load payload")
	}

	consistencyLevel, err := message.LoadUInt(8)
	if err != nil {
		return ExternalMessageModel{}, fmt.Errorf("failed to load consistency_level")
	}

	return ExternalMessageModel{
		TransactionID:    messages[0].Msg.Payload().Hash(),
		OPCode:           uint32(opCode),
		EmitterAddress:   emitterAddress,
		Sequence:         sequence,
		Nonce:            uint32(nonce),
		Payload:          payload,
		ConsistencyLevel: uint8(consistencyLevel),
	}, nil
}

func (e *Watcher) GetTransactionByReobserveRequest(ctx context.Context, txHash []byte) (*tlb.Transaction, error) {
	tx, err := e.Subscriber.tonClient.FindLastTransactionByOutMsgHash(ctx, e.contractAddress, txHash)
	if err != nil {
		return nil, fmt.Errorf("failed to find last transaction by out message hash: %w", err)
	}

	return tx, nil
}

func (ts *TxSubscriber) logFinishWork(err error) {
	if err != nil {
		ts.logger.Error("Finished listening to txs with error",
			zap.String("chainID", ts.addr.String()),
			zap.String("component", "TxSubscriber"),
			zap.String("addr", ts.addr.String()),
			zap.Error(err),
		)
	} else {
		ts.logger.Info("Finished listening to txs",
			zap.String("chainID", ts.addr.String()),
			zap.String("component", "TxSubscriber"),
			zap.String("addr", ts.addr.String()),
		)
	}
}

func getConfigURL(isTestnet bool) string {
	if isTestnet {
		return TestnetConfigURL
	}

	return MainnetConfigURL
}
