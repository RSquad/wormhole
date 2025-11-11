import {
    Address,
    beginCell,
    Cell,
    TonClient,
    internal,
    Dictionary,
    OpenedContract,
    Contract
} from "@ton/ton"
import { NETWORKS } from "./consts";
import { Payload, VAA } from "./vaa";
import {
    Network,
    contracts,
} from "@wormhole-foundation/sdk-base";
import {stringToCell} from "@ton/core/dist/boc/utils/strings";
import {initTonClientAndWallet} from "./tonWallet";
import { ethers } from "ethers";

    function convertVAAToTonFormat(payload: Payload, parsedVaa: VAA<any>, recipientAddress?: Address): Cell {
        const signaturesDict = Dictionary.empty(
            Dictionary.Keys.Uint(8),
            {
                serialize: (src: { signature: Buffer, guardianIndex: number }, builder) => {
                    builder.storeBuffer(src.signature, 65);
                    builder.storeUint(src.guardianIndex, 8);
                },
                parse: (src) => {
                    throw new Error("Not implemented");
                }
            }
        );

        parsedVaa.signatures.forEach((sig, index) => {
            signaturesDict.set(index, {
                signature: Buffer.from(sig.signature, 'hex'),
                guardianIndex: sig.guardianSetIndex
            });
        });

        let payloadCell: Cell;

        console.log("payload.type:", "Comment");

        console.log("payload.chain_id:", parsedVaa.payload.chainId);

        const toBuf: Buffer =
            Buffer.isBuffer(parsedVaa.payload.to) ? parsedVaa.payload.to : Buffer.from(parsedVaa.payload.to as Uint8Array);
        const toHex = toBuf.toString("hex");
        const toPrefix = parsedVaa.payload.chainId === 62 ? "0:" : "0x";
        console.log("payload.to:", toPrefix + toHex);

        const commentStr =
            typeof parsedVaa.payload.commentBytes === "string"
                ? parsedVaa.payload.commentBytes
                : Buffer.from(parsedVaa.payload.commentBytes as Uint8Array).toString("utf8");
        console.log("payload.comment:", commentStr);

            payloadCell = beginCell()
                .storeUint(parsedVaa.payload.chainId & 0xffff, 16)
                .storeBuffer(parsedVaa.payload.to, 32)
                .storeRef(stringToCell(parsedVaa.payload.commentBytes))
                .endCell();


    const tonVaa = beginCell()
        .storeUint(parsedVaa.version, 8)
        .storeUint(parsedVaa.guardianSetIndex, 32)
        .storeUint(parsedVaa.signatures.length, 8)
        .storeDict(signaturesDict)
        .storeUint(parsedVaa.timestamp, 32)
        .storeUint(parsedVaa.nonce, 32)
        .storeUint(parsedVaa.emitterChain, 16)
        .storeUint(BigInt(parsedVaa.emitterAddress.startsWith('0x') ? parsedVaa.emitterAddress : '0x' + parsedVaa.emitterAddress), 256)
        .storeUint(parsedVaa.sequence, 64)
        .storeUint(parsedVaa.consistencyLevel, 8)
        .storeRef(payloadCell)
        .endCell();

    return tonVaa;
}

export async function execute_ton(
    payload: Payload,
    vaa: Buffer,
    network: Network,
    contractAddress: string | undefined,
    rpc: string | undefined,
    parsedVaa?: VAA<any>
) {
    if (!parsedVaa) {
        throw new Error("Parsed VAA is required for TON");
    }

    const {client,contract:contractWallet,keyPair} =  await initTonClientAndWallet(NETWORKS[network])

    const vaaCell = await convertVAAToTonFormat(payload, parsedVaa, contractWallet.contract.address);

    await sendTonTransaction(
        network,
        rpc,
        contractAddress,
        "submit_vaa",
        vaaCell,
        client,
        contractWallet,
        keyPair
    );
}

const OP_RELAY_COMMENT = 0x327587B5;
const OP_SEND_COMMENT = 0x222A627E;
const OP_SEND_COMMENT_WITH_RELAY = 0x02851959;
const CHAIN_ID_ETHEREUM = 2;
const CHAIN_ID_TON = 62;

async function sendTonTransaction(
    network: Network,
    rpc: string | undefined,
    contractAddress: string,
    method: string,
    vaaCell: Cell,
    client: TonClient,
    contract: OpenedContract<any>,
    keyPair: { publicKey: Buffer; secretKey: Buffer }
): Promise<void> {
    const messageBody = beginCell()
        .storeUint(OP_RELAY_COMMENT, 32)  // opcode for RelayComment
        .storeUint(Date.now(), 64)        // queryId
        .storeRef(vaaCell)                // encodedVaa
        .endCell();

    console.log(`Preparing RelayComment message to Integrator contract...`);
    console.log(`Contract address: ${contractAddress}`);

    if (!contractAddress) {
        throw new Error("Contract address is required");
    }

    const { lt: prevLt, seqno } = await getContractStateInfo(client, contract);

    await contract.contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: Address.parse(contractAddress),
                value: BigInt(200000000), // 0.2 TON
                body: messageBody,
            })
        ],
    });

    console.log(`Transaction sent to ${contractAddress} via RelayComment`);

    await waitForTx(client,contract.contract.address,prevLt)

    console.log("Transaction confirmed");
    return 
}

export async function sendTonComment(
    network: Network,
    rpc: string | undefined,
    integratorAddress: string,
    commentText: string,
    toHex?: string,
    chainId: number = 62,
    consistencyLevel: number = 15,
): Promise<void> {
    const {client,contract,keyPair} =  await initTonClientAndWallet(NETWORKS[network])

    const toBuffer = (() => {
        if (!toHex) return Buffer.alloc(32); // default zero address if not provided

        try {
            const tonAddr = Address.parse(toHex);
            // Extract the 256-bit hash from TON address
            return tonAddr.hash;
        } catch (e) {
            const cleaned = toHex.startsWith("0x") ? toHex.slice(2) : toHex;
            const buf = Buffer.from(cleaned.padStart(64, "0"), "hex");
            if (buf.length !== 32) {
                throw new Error("to must be a valid TON address or 32-byte hex string");
            }
            return buf;
        }
    })();

    const queryId = BigInt(Date.now());

    const body = beginCell()
        .storeUint(OP_SEND_COMMENT, 32)
        .storeUint(queryId, 64)
        .storeUint(consistencyLevel & 0xff, 8)
        .storeUint(chainId & 0xffff, 16)
        .storeBuffer(toBuffer, 32)
        .storeStringRefTail(commentText)
        .endCell();

    const { lt: prevLt, seqno } = await getContractStateInfo(client, contract);

    await contract.contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: Address.parse(integratorAddress),
                value: BigInt(100000000),
                body,
            })
        ],
    });

    await waitForTx(client,contract.contract.address,prevLt)

    console.log(`Message sent to Integrator ${integratorAddress}`);
    console.log(`QueryId: ${queryId}`);
    console.log("Transaction confirmed");
}

async function waitForTx(client: TonClient, addr: Address,  prevLt?: bigint, timeoutMs = 80000) {
    const start = Date.now();

    for (; ;) {
        const txs = await client.getTransactions(addr, {limit: 1}).catch(() => []);
        if (txs.length > 0) {
            const tx = txs[0];
            if (prevLt && tx.lt > prevLt) {
                return;
            }

            if (Date.now() - start > timeoutMs) {
                throw new Error("Timeout waiting for transaction to be applied");
            }
            await new Promise(r => setTimeout(r, 1500));
        }
    }
}

export async function queryRegistrationsTon(
    network: Network,
    module: "Core"
): Promise<Object> {
    const networkConfig = NETWORKS[network]["Ton"];
    if (!networkConfig || !networkConfig.rpc) {
        throw new Error(`No RPC configured for TON on ${network}`);
    }

    const client = new TonClient({ endpoint: networkConfig.rpc });
    
    let contractAddress: string | undefined;

    switch (module) {
        case "Core":
            contractAddress = contracts.coreBridge.get(network, "Ton");
            break;
        default:
            throw new Error(`Invalid module: ${module}`);
    }

    if (!contractAddress) {
        throw Error(`Unknown ${module} contract on ${network} for TON`);
    }

    const results: { [key: string]: string } = {};
    
    console.log(`Querying registrations for ${module} at ${contractAddress}`);
    
    return results;
}

interface QuoteRequest {
    srcChain: number;
    dstChain: number;
    relayInstructions?: string;
}

interface QuoteResponse {
    signedQuote: string;
    estimatedCost?: string;
}

interface Quote {
    Prefix: number;
    QuoterAddress: Uint8Array;
    PayeeAddress: Uint8Array;
    SrcChain: number;
    DstChain: number;
    ExpiryTime: bigint;
}

export async function getQuoteAndSignature(srcChainID: number, dstChainID: number): Promise<[Uint8Array, Uint8Array, string]> {
    const request: QuoteRequest = {
        srcChain: srcChainID,
        dstChain: dstChainID,
    };

    const jsonData = JSON.stringify(request);

    const url = process.env.EXECUTOR_API_URL || "http://localhost:8082";

    const response = await fetch(`${url}/executor/v1/quote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: jsonData,
    });

    if (!response.ok) {
        throw new Error(`quote API returned status ${response.status}`);
    }

    const quoteResponse: QuoteResponse = await response.json();

    const quoteData = ethers.utils.arrayify(quoteResponse.signedQuote);

    const message = quoteData.slice(0, 100);
    const signature = quoteData.slice(100);

    return [message, signature, quoteResponse.signedQuote];
}

export function parseQuote(data: Uint8Array): Quote {
    if (data.length < 68) {
        throw new Error(`not enough bytes: expected at least 68, got ${data.length}`);
    }

    const view = new DataView(data.buffer, data.byteOffset);

    let offset = 0;

    const prefix = view.getUint32(offset, false); // big endian
    offset += 4;

    const quoterAddress = new Uint8Array(data.slice(offset, offset + 20));
    offset += 20;

    const payeeAddress = new Uint8Array(data.slice(offset, offset + 32));
    offset += 32;

    const srcChain = view.getUint16(offset, false); // big endian
    offset += 2;

    const dstChain = view.getUint16(offset, false); // big endian
    offset += 2;

    const expiryTime = view.getBigUint64(offset, false); // big endian

    return {
        Prefix: prefix,
        QuoterAddress: quoterAddress,
        PayeeAddress: payeeAddress,
        SrcChain: srcChain,
        DstChain: dstChain,
        ExpiryTime: expiryTime,
    };
}

interface SendCommentWithRelayParams {
    QueryID: bigint;
    ConsistencyLevel: number;
    ChainID: number;
    To: Uint8Array;
    Comment: Cell;
    TotalCost: bigint;
    RefundAddress: Uint8Array;
    SignedQuote: Cell;
    Signature: Uint8Array;
    GasLimit: bigint;
    ExtraRelayInstr: Cell;
}

export async function getTONQuoteFromAPI(srcChain: number, dstChain: number): Promise<Cell> {
    const [quote] = await getQuoteAndSignature(srcChain, dstChain);

    const parsedQuote = parseQuote(quote);

    // Convert Uint8Array to Buffer for TON SDK
    const quoterBuffer = Buffer.from(parsedQuote.QuoterAddress);
    const payeeBuffer = Buffer.from(parsedQuote.PayeeAddress);

    const quoteCell = beginCell()
        .storeUint(parsedQuote.Prefix, 32)
        .storeBuffer(quoterBuffer, 20)   // 20 bytes
        .storeBuffer(payeeBuffer, 32)    // 32 bytes
        .storeUint(parsedQuote.SrcChain, 16)
        .storeUint(parsedQuote.DstChain, 16)
        .storeUint(parsedQuote.ExpiryTime, 64)
        .endCell();

    return quoteCell;
}

function buildSendCommentWithRelayBody(params: SendCommentWithRelayParams): Cell {
    if (params.TotalCost < BigInt(0) || params.TotalCost >= BigInt(2) ** BigInt(256)) {
        throw new Error("totalCost must be uint256");
    }
    if (params.GasLimit < BigInt(0) || params.GasLimit >= BigInt(2) ** BigInt(128)) {
        throw new Error("gasLimit must be uint128");
    }

    // Convert Uint8Array to Buffer for TON SDK
    const toBuffer = Buffer.from(params.To);
    const refundBuffer = Buffer.from(params.RefundAddress);
    const signatureBuffer = Buffer.from(params.Signature);

    return beginCell()
        .storeUint(OP_SEND_COMMENT_WITH_RELAY, 32)
        .storeUint(params.QueryID, 64)
        .storeUint(params.ConsistencyLevel & 0xff, 8)
        .storeUint(params.ChainID & 0xffff, 16)
        .storeBuffer(toBuffer, 32)   // 32 bytes
        .storeRef(params.Comment)
        .storeUint(params.TotalCost, 256)
        .storeBuffer(refundBuffer, 32)  // 32 bytes
        .storeRef(params.SignedQuote)
        .storeRef(beginCell().storeBuffer(signatureBuffer, 64).endCell()) // signature in ref
        .storeRef(params.ExtraRelayInstr)
        .endCell();
}

export async function sendTonCommentWithRelay(
    network: Network,
    integratorAddress: string,
    commentText: string,
    toHex?: string,
    chainId: number = CHAIN_ID_TON,
    consistencyLevel: number = 15,
    totalCost: bigint = BigInt(100000000),
    gasLimit: bigint = BigInt(50000),
    refundAddressHex?: string,
    extraRelayInstr?: Cell
): Promise<void> {
    const {client, contract, keyPair} = await initTonClientAndWallet(NETWORKS[network]);

    // Get quote and signature from API
    const signedQuote = await getTONQuoteFromAPI(CHAIN_ID_TON, chainId);
    const [, fullSignature] = await getQuoteAndSignature(CHAIN_ID_TON, chainId);

    // Extract r, s from signature (remove v if present)
    // Ethereum signature format: r (32) + s (32) + v (1) = 65 bytes
    // TON solEcrecover expects: r (32) + s (32) = 64 bytes
    const signature = fullSignature.length === 65 ? fullSignature.slice(0, 64) : fullSignature;

    // Prepare addresses
    const toBuffer = (() => {
        if (!toHex) return new Uint8Array(32); // default zero address if not provided

        try {
            const tonAddr = Address.parse(toHex);
            return tonAddr.hash;
        } catch (e) {
            const cleaned = toHex.startsWith("0x") ? toHex.slice(2) : toHex;
            const buf = Buffer.from(cleaned.padStart(64, "0"), "hex");
            if (buf.length !== 32) {
                throw new Error("to must be a valid TON address or 32-byte hex string");
            }
            return buf;
        }
    })();

    const refundAddress = (() => {
        if (!refundAddressHex) return new Uint8Array(32);

        try {
            const tonAddr = Address.parse(refundAddressHex);
            return tonAddr.hash;
        } catch (e) {
            const cleaned = refundAddressHex.startsWith("0x") ? refundAddressHex.slice(2) : refundAddressHex;
            const buf = Buffer.from(cleaned.padStart(64, "0"), "hex");
            if (buf.length !== 32) {
                throw new Error("refundAddress must be a valid TON address or 32-byte hex string");
            }
            return buf;
        }
    })();

    const queryId = BigInt(Date.now());

    // Create comment cell
    const commentCell = beginCell()
        .storeStringTail(commentText)
        .endCell();

    // Default extra relay instructions if not provided
    const defaultExtraRelayInstr = beginCell().endCell();
    const extraRelayInstrCell = extraRelayInstr || defaultExtraRelayInstr;

    const params: SendCommentWithRelayParams = {
        QueryID: queryId,
        ConsistencyLevel: consistencyLevel,
        ChainID: chainId,
        To: toBuffer,
        Comment: commentCell,
        TotalCost: totalCost,
        RefundAddress: refundAddress,
        SignedQuote: signedQuote,
        Signature: signature,
        GasLimit: gasLimit,
        ExtraRelayInstr: extraRelayInstrCell,
    };

    const body = buildSendCommentWithRelayBody(params);

    const { lt: prevLt, seqno } = await getContractStateInfo(client, contract);

    await contract.contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: Address.parse(integratorAddress),
                value: totalCost,
                body,
            })
        ],
    });

    await waitForTx(client, contract.contract.address, prevLt);

    console.log(`Comment with relay sent to Integrator ${integratorAddress}`);
    console.log(`QueryId: ${queryId}`);
    console.log("Transaction confirmed");
}

export async function getContractStateInfo(
    client: TonClient,
    contract: OpenedContract<any>
): Promise<{ lt: bigint; seqno: number }> {
    try {
        const stateBefore = await client.getContractState(contract.contract.address).catch(() => undefined as any);
        const ltRaw = stateBefore?.lastTransaction?.lt;
        const lt = BigInt(ltRaw);
        const seqno = await contract.contract.getSeqno();

        return { lt, seqno };
    } catch (err) {
        throw new Error("error when try to get contract state info")
    }
}