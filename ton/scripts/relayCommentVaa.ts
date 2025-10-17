import { NetworkProvider } from '@ton/blueprint';
import { Integrator } from '../wrappers/Integrator';
import { Address, beginCell, Builder, Cell, toNano } from '@ton/core';
import { CommentPayload, createEmptySignatures } from '../wrappers/Structs';
import { TON_CHAIN_ID } from '../wrappers/Constants';
import fs from 'fs';

export interface ParsedVaa {
    version: number;
    guardianSetIndex: number;
    guardianSignatures: GuardianSignature[];
    timestamp: number;
    nonce: number;
    emitterChain: number;
    emitterAddress: Buffer;
    sequence: bigint;
    consistencyLevel: number;
    payload: Buffer;
    hash: Buffer;
}

export type SignedVaa = Uint8Array | Buffer;
export interface GuardianSignature {
    index: number;
    signature: Buffer;
}

export function parseVaa(vaa: SignedVaa): ParsedVaa {
    const signedVaa = Buffer.isBuffer(vaa) ? vaa : Buffer.from(vaa as Uint8Array);
    const sigStart = 6;
    const numSigners = signedVaa[5];
    const sigLength = 66;

    const guardianSignatures: GuardianSignature[] = [];
    for (let i = 0; i < numSigners; ++i) {
        const start = sigStart + i * sigLength;
        guardianSignatures.push({
            index: signedVaa[start],
            signature: signedVaa.subarray(start + 1, start + 66),
        });
    }

    const body = signedVaa.subarray(sigStart + sigLength * numSigners);

    return {
        version: signedVaa[0],
        guardianSetIndex: signedVaa.readUInt32BE(1),
        guardianSignatures,
        timestamp: body.readUInt32BE(0),
        nonce: body.readUInt32BE(4),
        emitterChain: body.readUInt16BE(8),
        emitterAddress: body.subarray(10, 42),
        sequence: body.readBigUInt64BE(42),
        consistencyLevel: body[50],
        payload: body.subarray(51),
        hash: Buffer.alloc(32),
    };
}

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const contracts = fs.readFileSync('contracts.json', 'utf8');
    const contractsJson = JSON.parse(contracts);

    const base64Vaa = await ui.input('Enter vaa:');
    const vaaBuffer = Buffer.from(base64Vaa, 'base64');
    const vaa = parseVaa(vaaBuffer);
    const integrator = provider.open(Integrator.createFromAddress(Address.parse(contractsJson.integrator)));

    const signatures = createEmptySignatures();
    for (let i = 0; i < vaa.guardianSignatures.length; i++) {
        signatures.set(i, {
            signature: vaa.guardianSignatures[i].signature,
            guardianIndex: vaa.guardianSignatures[i].index,
        });
    }
    let payloadCell: Cell;
    if (vaa.emitterChain === TON_CHAIN_ID) {
        console.log('Emitter chain is TON, deserialize payload as bag of cells');
        payloadCell = Cell.fromBoc(vaa.payload)[0];
    } else {
        console.log('Emitter chain is not TON, deserialize payload from plain buffer');
        const buf = vaa.payload;
        console.log('buf:', buf.toString('hex'));
        const comment: CommentPayload = {
            chainId: buf.readUInt16BE(0),
            to: buf.subarray(2, 34),
            comment: buf.subarray(36).toString('utf8'),
        };
        payloadCell = beginCell()
            .storeUint(comment.chainId, 16)
            .storeBuffer(comment.to, 32)
            .storeStringRefTail(comment.comment)
            .endCell();
    }
    const vaaCell = beginCell()
        .storeUint(vaa.version, 8)
        .storeUint(vaa.guardianSetIndex, 32)
        .storeUint(vaa.guardianSignatures.length, 8)
        .storeDict(signatures)
        .storeUint(vaa.timestamp, 32)
        .storeUint(vaa.nonce, 32)
        .storeUint(vaa.emitterChain, 16)
        .storeBuffer(vaa.emitterAddress, 32)
        .storeUint(vaa.sequence, 64)
        .storeUint(vaa.consistencyLevel, 8)
        .storeRef(payloadCell)
        .endCell();

    await integrator.sendRelayComment(provider.sender(), toNano(0.1), {
        queryId: 0,
        encodedVaa: vaaCell,
    });

    console.log('Done');
}
