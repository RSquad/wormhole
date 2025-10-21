import { Address, beginCell, Builder, Cell, Dictionary, Slice } from '@ton/core';
import { SignatureDictionaryValue } from './Wormhole';
import { encodePacked, keccak256 } from 'web3-utils';

export type GuardianSet = {
    keys: Buffer[];
    expirationTime: number;
};

export type GuardianSignature = {
    index: number;
    signature: Buffer;
};
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

export const createEmptySignatures = (): Dictionary<number, GuardianSignature> => {
    return Dictionary.empty(Dictionary.Keys.Uint(8), SignatureDictionaryValue);
};

export const VAAtoCell = (vaa: ParsedVaa, payloadToCell: (payload: Buffer) => Cell): Cell => {
    const signatures = createEmptySignatures();
    for (let i = 0; i < vaa.guardianSignatures.length; i++) {
        signatures.set(i, {
            signature: vaa.guardianSignatures[i].signature,
            index: vaa.guardianSignatures[i].index,
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

export function calcVaaHash(vaa: ParsedVaa): Buffer {
    const body = encodePacked(
        { type: 'uint32', value: vaa.timestamp },
        { type: 'uint32', value: vaa.nonce },
        { type: 'uint16', value: vaa.emitterChain },
        { type: 'bytes32', value: '0x' + vaa.emitterAddress.toString('hex') },
        { type: 'uint64', value: vaa.sequence },
        { type: 'uint8', value: vaa.consistencyLevel },
        { type: 'bytes', value: '0x' + vaa.payload.toString('hex') },
    );

    return Buffer.from(keccak256(keccak256(body)).slice(2), 'hex');
}

export const GuardianSetDictionaryValue = {
    serialize: (src: GuardianSet, builder: Builder) => {
        const keysDict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Buffer(32));
        src.keys.forEach((key, index) => {
            keysDict.set(index, key);
        });
        builder.storeDict(keysDict).storeUint(src.keys.length, 8).storeUint(src.expirationTime, 32);
    },
    parse: (src: Slice): GuardianSet => {
        const keysDict = src.loadDict(Dictionary.Keys.Uint(8), Dictionary.Values.Buffer(32));
        const keys = keysDict.keys().map((key) => {
            return keysDict.get(key)!;
        });
        const count = src.loadUint(8);
        if (count !== keys.length) {
            throw new Error('Invalid guardian set count: parsed ' + keys.length + ' keys, got ' + count);
        }
        const expirationTime = src.loadUint(32);
        return { keys, expirationTime };
    },
};

export const decodeCommentPayload = (payload: Cell): CommentPayload => {
    const slice = payload.beginParse();
    return { chainId: slice.loadUint(16), to: slice.loadBuffer(32), comment: slice.loadStringRefTail() };
};
