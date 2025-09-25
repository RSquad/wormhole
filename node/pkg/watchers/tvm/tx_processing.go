package tvm

import (
	"context"
	"encoding/hex"
	"fmt"
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

	subChan := make(chan *tlb.Transaction)
	go ts.tonClient.SubscribeOnTransactions(ctx, ts.addr, ts.lt, subChan)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case tx, ok := <-subChan:
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
	OPCode           uint32
	EmitterAddress   address.Address
	Sequence         uint64
	Nonce            uint32
	Payload          *cell.Cell
	ConsistencyLevel uint8
}

func getExternalMessageFields(tx *tlb.Transaction) (ExternalMessageModel, error) {
	if tx == nil || tx.IO.In == nil || tx.IO.In.AsExternalOut() == nil || tx.IO.In.AsExternalOut().Payload() == nil {
		return ExternalMessageModel{}, fmt.Errorf("no message body in tx")
	}

	message := tx.IO.In.AsExternalOut().Payload().BeginParse()

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
		OPCode:           uint32(opCode),
		EmitterAddress:   *emitterAddress,
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
