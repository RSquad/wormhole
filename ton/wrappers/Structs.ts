import { Address, beginCell, Cell, Dictionary } from '@ton/core';
import { GuardianSet, GuardianSetDictionaryValue, Signature, SignatureDictionaryValue } from './Wormhole';
import { randomBytes } from 'crypto';
import { TON_CHAIN_ID } from './Constants';

export interface GuardianSignature {
    index: number;
    signature: Buffer;
}

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

export type CommentPayload = {
    chainId: number;
    to: Buffer;
    comment: string;
};

export const createEmptyGuardianSet = (): Dictionary<number, GuardianSet> => {
    return Dictionary.empty(Dictionary.Keys.Uint(8), GuardianSetDictionaryValue);
};

export const createEmptySequences = (): Dictionary<Address, number> => {
    return Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.Uint(64));
};

export const createEmptySignatures = (): Dictionary<number, Signature> => {
    return Dictionary.empty(Dictionary.Keys.Uint(8), SignatureDictionaryValue);
};

export const randomSignature = (index: number): Signature => {
    return { signature: randomBytes(65), guardianIndex: index };
};

export const generateVAACell = (signaturesCount: number, payload?: Cell) => {
    // Create a test VM that follows the contract's parsing order
    const signaturesDict = createEmptySignatures();
    for (let i = 0; i < signaturesCount; i++) {
        signaturesDict.set(i, randomSignature(i));
    }
    const vmData = beginCell()
        .storeUint(1, 8) // version
        .storeUint(0, 32) // guardianSetIndex
        .storeUint(signaturesDict.size, 8) // signaturesCount
        .storeDict(signaturesDict)
        .storeUint(Math.floor(Date.now() / 1000), 32) // timestamp
        .storeUint(123, 32) // nonce
        .storeUint(TON_CHAIN_ID, 16) // emitterChainId
        .storeUint(0, 256) // emitterAddress
        .storeUint(1, 64) // sequence
        .storeUint(1, 8) // consistencyLevel
        .storeRef(payload || beginCell().storeStringTail('test payload').endCell()) // payload
        .endCell();
    return vmData;
};

export const VAAtoCell = (vaa: ParsedVaa, payloadToCell: (payload: Buffer) => Cell): Cell => {
    const signatures = createEmptySignatures();
    for (let i = 0; i < vaa.guardianSignatures.length; i++) {
        signatures.set(i, {
            signature: vaa.guardianSignatures[i].signature,
            guardianIndex: vaa.guardianSignatures[i].index,
        });
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
        .storeRef(payloadToCell(vaa.payload))
        .endCell();
    return vaaCell;
};

export function parseVaa(vaa: Buffer): ParsedVaa {
    const sigStart = 6;
    const numSigners = vaa[5];
    const sigLength = 66;

    const guardianSignatures: GuardianSignature[] = [];
    for (let i = 0; i < numSigners; ++i) {
        const start = sigStart + i * sigLength;
        guardianSignatures.push({
            index: vaa[start],
            signature: vaa.subarray(start + 1, start + 66),
        });
    }

    const body = vaa.subarray(sigStart + sigLength * numSigners);

    return {
        version: vaa[0],
        guardianSetIndex: vaa.readUInt32BE(1),
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

export const decodeCommentPayload = (payload: Cell): CommentPayload => {
    const slice = payload.beginParse();
    return { chainId: slice.loadUint(16), to: slice.loadBuffer(32), comment: slice.loadStringRefTail() };
};
