import { Address, beginCell, Cell, OpenedContract, TonClient, WalletContractV4, internal, Dictionary } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { NETWORKS } from "./consts";
import { Payload, impossible, VAA } from "./vaa";
import {
    Chain,
    Network,
    contracts,
} from "@wormhole-foundation/sdk-base";

// Updated: core expects raw VAA bytes wrapped in a cell
function convertVAAToTonFormat(vaa: Buffer, _parsedVaa: VAA<any>, _recipientAddress: Address): Cell {
    return beginCell().storeBuffer(vaa).endCell();
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
    chainId: number = 2,
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

    // Expect 32-byte destination address as hex (e.g., EVM address without 0x or with 0x)
    const toBuffer = (() => {
        if (!toHex) return Buffer.alloc(32); // default zero address if not provided
        const cleaned = toHex.startsWith("0x") ? toHex.slice(2) : toHex;
        const buf = Buffer.from(cleaned.padStart(64, "0"), "hex");
        if (buf.length !== 32) {
            throw new Error("to must be a 32-byte hex string");
        }
        return buf;
    })();

    const commentCell = beginCell().storeStringTail(commentText).endCell();

    const body = beginCell()
        .storeUint(OP_SEND_COMMENT, 32)
        .storeUint(queryId ?? BigInt(Date.now()), 64)
        .storeUint(consistencyLevel & 0xff, 8)
        .storeUint(chainId & 0xffff, 16)
        .storeBuffer(toBuffer, 32)
        .storeRef(commentCell)
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