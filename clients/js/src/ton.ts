import { Address, beginCell, Cell, OpenedContract, TonClient, WalletContractV4, internal, Dictionary } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { NETWORKS } from "./consts";
import { Payload, impossible, VAA } from "./vaa";
import {
    Chain,
    Network,
    contracts,
} from "@wormhole-foundation/sdk-base";

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
    
    if (parsedVaa.payload.type === 'TonComment') {
        const asciiPayload = parsedVaa.payload.ascii || '';
        const hexMatch = asciiPayload.match(/\[([a-fA-F0-9]+)\]/);
        
        let commentText = '';
        if (hexMatch) {
            try {
                commentText = Buffer.from(hexMatch[1], 'hex').toString('utf8');
            } catch (e) {
                commentText = asciiPayload;
            }
        } else {
            commentText = asciiPayload;
        }
        
        console.log(`Extracted comment text: "${commentText}"`);

        const finalRecipientAddress = recipientAddress || Address.parse('0:0000000000000000000000000000000000000000000000000000000000000000');

        const commentCell = beginCell()
            .storeStringTail(commentText)
            .endCell();

        payloadCell = beginCell()
            .storeAddress(finalRecipientAddress)
            .storeRef(commentCell)
            .endCell();
    } else {
        const payloadHex = (parsedVaa.payload as any).hex || '';
        payloadCell = beginCell()
            .storeBuffer(Buffer.from(payloadHex, 'hex'))
            .endCell();
    }

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