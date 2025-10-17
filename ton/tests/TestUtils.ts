import * as tinysecp from 'tiny-secp256k1';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import { randomBytes } from 'crypto';
import { Slice, Transaction } from '@ton/ton';
import { sha256_sync } from '@ton/crypto';
import { findTransactionRequired, FlatTransactionComparable } from '@ton/test-utils';
import { GuardianSignature, ParsedVaa } from '../wrappers/Structs';
import { TON_CHAIN_ID } from '../wrappers/Constants';
import assert from 'assert';
import { keccak256 } from 'web3-utils';

export type KeyPair = {
    privateKey: Buffer;
    keyPair: ECPairInterface;
};

const ECPair = ECPairFactory(tinysecp);

export class Time {
    static oneHourSeconds = 3600;

    static now = (offsetSeconds?: number): number => {
        return Math.floor(Date.now() / 1000) + (offsetSeconds ?? 0);
    };
    static hours = (hours: number): number => {
        return Time.now(Time.oneHourSeconds * hours);
    };
}

export class Random {
    static id = (bits: number): number => {
        return Math.floor(Math.random() * (2 ** bits - 1));
    };
}

export class Crypto {
    static makeRandomKeyPair = (compressed: boolean = true) => {
        const privateKey = randomBytes(32);
        const keyPair = ECPair.fromPrivateKey(privateKey, { compressed });
        return {
            privateKey,
            keyPair,
        };
    };

    static toXOnly = (publicKey: Buffer) => {
        return publicKey.length === 33 ? publicKey.subarray(1) : publicKey;
    };

    static makeRandomKeyPairs = (count: number, compressed: boolean = true): KeyPair[] => {
        return Array.from({ length: count }, () => Crypto.makeRandomKeyPair(compressed));
    };

    static mapKeyPairsToEvmAddresses = (keyPairs: KeyPair[]): Buffer[] => {
        return keyPairs.map((k) => Buffer.from(calcEvmAddress(k.keyPair.publicKey)));
    };

    static mapKeyPairsToXOnlyPublicKeys = (keyPairs: KeyPair[]): Buffer[] => {
        return keyPairs.map((keyPair) => Crypto.toXOnly(keyPair.keyPair.publicKey as Buffer));
    };
}

export class Event {
    static mustFindEvent = (transactions: Transaction[], match: FlatTransactionComparable, eventId: number): Slice => {
        const tx = findTransactionRequired(transactions, match);
        const event = tx.outMessages.values().find((msg) => msg.info.type === 'external-out');
        expect(event).toBeDefined();
        const eventBody = event!.body.beginParse();
        expect(eventBody.loadUint(32)).toBe(eventId);
        return eventBody;
    };
}

export const randomSignature = (index: number): GuardianSignature => {
    const key = Crypto.makeRandomKeyPair();
    const hash = sha256_sync(Buffer.from('test'));
    const sigData = tinysecp.signRecoverable(hash, key.privateKey);
    tinysecp.pointAdd;
    const signature = Buffer.concat([Buffer.from(sigData.signature), Buffer.from([sigData.recoveryId])]);
    assert.equal(signature.length, 65, 'Signature must be 65 bytes');
    return { signature, index };
};

export const generateVAA = (
    guardianSetIndex: number,
    signaturesCount: number,
    payload: Buffer,
    signatures?: GuardianSignature[],
): ParsedVaa => {
    const guardianSignatures = signatures || Array.from({ length: signaturesCount }, (_, i) => randomSignature(i));
    const vaa: ParsedVaa = {
        version: 1,
        guardianSetIndex,
        guardianSignatures,
        timestamp: Math.floor(Date.now() / 1000),
        nonce: 123,
        emitterChain: TON_CHAIN_ID,
        emitterAddress: Buffer.alloc(32, 0),
        sequence: 1n,
        consistencyLevel: 1,
        payload: payload,
        hash: Buffer.alloc(32, 0),
    };
    return vaa;
};

export const calcEvmAddress = (publicKey: Uint8Array): Uint8Array => {
    const hash = keccak256(Buffer.from(publicKey.subarray(1)));
    const addr = Buffer.from(hash.slice(2 + 24).padStart(64, '0'), 'hex');
    return addr;
};
