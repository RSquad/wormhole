package tvm

import (
	"context"
	"encoding/hex"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"go.uber.org/zap"
	"strings"
)

type TxSubscriber struct {
	tonClient *TonClient
	addr      *address.Address
	lt        uint64
	outChan   chan<- *tlb.Transaction
	logger    *zap.Logger
}

func NewTxSubscriber(
	tonClient *TonClient,
	addr *address.Address,
	lt uint64,
	outChan chan<- *tlb.Transaction,
	logger *zap.Logger,
) *TxSubscriber {
	return &TxSubscriber{
		tonClient: tonClient,
		addr:      addr,
		lt:        lt,
		outChan:   outChan,
		logger:    logger,
	}
}

func (ts *TxSubscriber) Work(ctx context.Context) (err error) {
	ts.logStartWork()
	defer ts.logFinishWork(err)

	subChan := make(chan *tlb.Transaction)
	go ts.tonClient.API.SubscribeOnTransactions(ctx, ts.addr, ts.lt, subChan)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case tx, ok := <-subChan:
			if !ok {
				return nil
			}
			ts.logTxReceived(tx)
			ts.outChan <- tx
		}
	}
}

func (ts *TxSubscriber) logStartWork() {
	ts.logger.Info("Start listening to txs",
		zap.String("component", "TxSubscriber"),
		zap.String("addr", ts.addr.String()),
		zap.Uint64("start_tx_lt", ts.lt),
	)
}

func (ts *TxSubscriber) logFinishWork(err error) {
	if err != nil {
		ts.logger.Error("Finished listening to txs with error",
			zap.String("component", "TxSubscriber"),
			zap.String("addr", ts.addr.String()),
			zap.Error(err),
		)
	} else {
		ts.logger.Info("Finished listening to txs",
			zap.String("component", "TxSubscriber"),
			zap.String("addr", ts.addr.String()),
		)
	}
}

func (ts *TxSubscriber) logTxReceived(tx *tlb.Transaction) {
	ts.logger.Info("Received transaction",
		zap.String("component", "TxSubscriber"),
		zap.String("address", ts.addr.String()),
		zap.String("tx_hash", hex.EncodeToString(tx.Hash)),
	)
}

type TonClient struct {
	Pool *liteclient.ConnectionPool
	API  *ton.APIClient
}

func NewTonClient(configPathOrURL string) (*TonClient, error) {
	pool := liteclient.NewConnectionPool()
	if strings.HasPrefix(configPathOrURL, "http://") || strings.HasPrefix(configPathOrURL, "https://") {
		err := pool.AddConnectionsFromConfigUrl(context.Background(), configPathOrURL)
		if err != nil {
			return nil, err
		}
	} else {
		err := pool.AddConnectionsFromConfigFile(configPathOrURL)
		if err != nil {
			return nil, err
		}
	}

	api := ton.NewAPIClient(pool).WithRetry(5)

	return &TonClient{
		Pool: pool,
		API:  api.(*ton.APIClient),
	}, nil
}
