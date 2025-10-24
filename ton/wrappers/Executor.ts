import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ExecutorConfig = {};

export function executorConfigToCell(_config: ExecutorConfig): Cell {
    return beginCell().endCell();
}

export type RequestExecutionOpts = {
    queryId: number;
    quoterAddress: Address;
    dstChain: number;
    dstAddr: Buffer; // 32 bytes hash
    refundAddr: Buffer; // 32 bytes hash
    signedQuote: Cell;
    request: Cell;
    relayInstructions: Cell;
};

export class Executor implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Executor(address);
    }

    static createFromConfig(config: ExecutorConfig, code: Cell, workchain = 0) {
        const data = executorConfigToCell(config);
        const init = { code, data };
        return new Executor(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARАТELY,
            body: beginCell().endCell(),
        });
    }

    async sendRequestExecution(provider: ContractProvider, via: Sender, value: bigint, opts: RequestExecutionOpts) {
        if (opts.dstAddr.length !== 32) throw new Error('dstAddr must be 32 bytes');
        if (opts.refundAddr.length !== 32) throw new Error('refundAddr must be 32 bytes');
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xE6EC7E01, 32) // struct tag of RequestExecution
                .storeUint(opts.queryId, 64)
                .storeAddress(opts.quoterAddress)
                .storeUint(opts.dstChain, 16)
                .storeBuffer(opts.dstAddr, 32)
                .storeBuffer(opts.refundAddr, 32)
                .storeRef(opts.signedQuote)
                .storeRef(opts.request)
                .storeRef(opts.relayInstructions)
                .endCell(),
        });
    }
}


