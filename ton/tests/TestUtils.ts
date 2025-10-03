import * as tinysecp from 'tiny-secp256k1';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import { randomBytes } from 'crypto';

export type KeyPair = {
    privateKey: Buffer;
    keyPair: ECPairInterface;
};

const ECPair = ECPairFactory(tinysecp);

export const makeRandomId = (bits: number): number => {
    return Math.floor(Math.random() * (2 ** bits - 1));
};

export const now = (offsetSeconds?: number): number => {
    return Math.floor(Date.now() / 1000) + (offsetSeconds ?? 0);
};

export const makeRandomKeyPair = () => {
    const privateKey = randomBytes(32);
    const keyPair = ECPair.fromPrivateKey(privateKey);
    return {
        privateKey,
        keyPair,
    };
};

export const toXOnly = (publicKey: Buffer) => {
    return publicKey.length === 33 ? publicKey.subarray(1) : publicKey;
};

export const makeRandomKeyPairs = (count: number): KeyPair[] => {
    return Array.from({ length: count }, () => makeRandomKeyPair());
};

export const mapKeyPairsToXOnlyPublicKeys = (keyPairs: KeyPair[]): Buffer[] => {
    return keyPairs.map((keyPair) => toXOnly(keyPair.keyPair.publicKey as Buffer));
};