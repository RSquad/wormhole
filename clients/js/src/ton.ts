import { Address, beginCell, Cell, OpenedContract, TonClient, WalletContractV4, internal, Dictionary } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { NETWORKS } from "./consts";
import { Payload, impossible, VAA } from "./vaa";
import {
    Chain,
    Network,
    contracts,
} from "@wormhole-foundation/sdk-base";

    function isBoc(buf: Buffer): boolean {
        return buf.length >= 4 && buf[0] === 0xb5 && buf[1] === 0xee && buf[2] === 0x9c && buf[3] === 0x72;
    }

    function leftPadTo32(b: Buffer): Buffer {
        if (b.length === 32) return b;
        if (b.length > 32) throw new Error(`"to" field longer than 32 bytes (${b.length})`);
        const out = Buffer.alloc(32);
        b.copy(out, 32 - b.length);
        return out;
    }

    /**CommentVaa = { chainId:uint16, to:uint256, comment:ref cell } */
    function parseCommentVaaFromBoc(bocHex: string): { chainId: number; to: Buffer; comment: Cell } {
        const raw = Buffer.from(bocHex, "hex");
        if (!isBoc(raw)) throw new Error("Not a BOC (invalid magic)");
        const [root] = Cell.fromBoc(raw);
        const cs = root.beginParse();

        const chainId = Number(cs.loadUint(16));
        const to = Buffer.from(cs.loadBuffer(32));            // 32 байта как есть
        const comment = cs.loadRef();                         // ref-ячейка

        return { chainId, to, comment };
    }

    function convertVAAToTonFormat(vaa: Buffer, parsedVaa: VAA<any>, recipientAddress?: Address): Cell {
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


            const {chainId, to, comment} = parseCommentVaaFromBoc(parsedVaa.payload.hex);

            payloadCell = beginCell()
                .storeUint(chainId & 0xffff, 16)
                .storeBuffer(leftPadTo32(to), 32)
                .storeRef(comment)
                .endCell();

            console.log(`Parsed CommentVaa from BOC: chainId=${chainId}, to=0x${to.toString("hex")}`);

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
    contract: string | undefined,
    rpc: string | undefined,
    parsedVaa?: VAA<any>
) {
    const chain: Chain = "Ton";

    if (!parsedVaa) {
        throw new Error("Parsed VAA is required for TON");
    }

    const networkConfig = NETWORKS[network]["Ton"];
    if (!networkConfig?.key) {
        throw new Error("No mnemonic/key for TON");
    }


    const keyPair = await mnemonicToPrivateKey(networkConfig.key.split(" "));
    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });

    const vaaCell = convertVAAToTonFormat(vaa, parsedVaa, wallet.address);

    console.log("Submitting vaa");
    await sendTonTransaction(
        network,
        rpc,
        contract,
        "submit_vaa",
        vaaCell
    );
}

const OP_RELAY_COMMENT = 0x327587B5;
const OP_SEND_COMMENT = 0x222A627E;

async function sendTonTransaction(
    network: Network,
    rpc: string | undefined,
    contractAddress: string,
    method: string,
    vaaCell: Cell
): Promise<string> {
    const networkConfig = NETWORKS[network]["Ton"];
    if (!networkConfig) {
        throw new Error(`No network config for TON on ${network}`);
    }

    const mnemonic = networkConfig.key;
    if (!mnemonic) {
        throw new Error("No mnemonic/key for TON");
    }

    const rpcUrl = rpc ?? networkConfig.rpc;
    if (!rpcUrl) {
        throw new Error("No RPC URL for TON");
    }

    const client = new TonClient({ endpoint: rpcUrl });

    const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));

    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });

    const contract = client.open(wallet);

    const messageBody = beginCell()
        .storeUint(OP_RELAY_COMMENT, 32)  // opcode для RelayComment
        .storeUint(Date.now(), 64)        // queryId
        .storeRef(vaaCell)                // encodedVaa
        .endCell();

    console.log(`Preparing RelayComment message to Integrator contract...`);
    console.log(`Contract address: ${contractAddress}`);
    console.log(`VAA size: ${vaaCell.bits.length} bits, ${vaaCell.refs.length} refs`);

    const seqno = await contract.getSeqno();
    
    await contract.sendTransfer({
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

    let currentSeqno = seqno;
    while (currentSeqno === seqno) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        currentSeqno = await contract.getSeqno();
    }

    console.log("Transaction confirmed");
    console.log(`New seqno: ${seqno + 1}`);
    return `seqno-${seqno + 1}`;
}

// SendComment helper: sends a comment message to Integrator (publishes via Wormhole on TON)
export async function sendTonComment(
    network: Network,
    rpc: string | undefined,
    integratorAddress: string,
    commentText: string,
    toHex?: string,
    chainId: number = 62,
    consistencyLevel: number = 15,
    queryId?: bigint
): Promise<void> {
    const networkConfig = NETWORKS[network]["Ton"];
    if (!networkConfig?.key) throw new Error("No mnemonic/key for TON");

    const client = new TonClient({ endpoint: rpc ?? networkConfig.rpc! });
    if (!client) throw new Error("No RPC URL for TON");

    const keyPair = await mnemonicToPrivateKey(networkConfig.key.split(" "));
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    const contract = client.open(wallet);

    const toBuffer = (() => {
        if (!toHex) return Buffer.alloc(32); // default zero address if not provided

        try {
            const tonAddr = Address.parse(toHex);
            // Extract the 256-bit hash from TON address
            return tonAddr.hash;
        } catch (e) {
            // Not a TON address, try as hex string
            const cleaned = toHex.startsWith("0x") ? toHex.slice(2) : toHex;
            const buf = Buffer.from(cleaned.padStart(64, "0"), "hex");
            if (buf.length !== 32) {
                throw new Error("to must be a valid TON address or 32-byte hex string");
            }
            return buf;
        }
    })();

    const body = beginCell()
        .storeUint(OP_SEND_COMMENT, 32)
        .storeUint(queryId ?? BigInt(Date.now()), 64)
        .storeUint(consistencyLevel & 0xff, 8)
        .storeUint(chainId & 0xffff, 16)
        .storeBuffer(toBuffer, 32)
        .storeStringRefTail(commentText)
        .endCell();

    const seqno = await contract.getSeqno();
    await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: Address.parse(integratorAddress),
                value: BigInt(200000000),
                body,
            })
        ],
    });

    console.log(`Message sent to Integrator ${integratorAddress}`);
    console.log(`QueryId: ${queryId ?? BigInt(Date.now())}`);

    let currentSeqno = seqno;
    while (currentSeqno === seqno) {
        await new Promise(r => setTimeout(r, 1500));
        currentSeqno = await contract.getSeqno();
    }
    console.log("Transaction confirmed");
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