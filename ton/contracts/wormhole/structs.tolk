tolk 1.1

import "../libraries/errors"
import "../libraries/primitives"

const VERSION = 1

struct GuardianSet {
    keys: map<uint8, uint256>
    count: uint8
    expirationTime: uint32
}

struct Signature {
    signature: bytes65 // 512 bits
    guardianIndex: uint8
}

struct VM {
    version: uint8
    guardianSetIndex: uint32
    signatures: map<uint8, Signature>
    signaturesCount: uint8
    timestamp: uint32
    nonce: uint32
    emitterChainId: uint16
    emitterAddress: uint256 // bytes32
    sequence: uint64
    consistencyLevel: uint8
    payload: cell
}

fun VM.parse(c: cell): (VM, uint256) {
    /*
vaa#_
    version:uint8 
    guardianSetIndex:uint32
    signaturesCount:uint8
    signatures:HashmapE<uint8, Signature>
--- (offset = 49 bits)
    timestamp:uint32
    nonce:uint32
    emitterChainId:uint16
    emitterAddress:uint256
    sequence:uint64
    consistencyLevel:uint8
--- (offset = 457 bits)
    payload:cell
= VAA
*/
    var cs = c.beginParse();
    val version = cs.loadUint(8);
    val guardianSetIndex = cs.loadUint(32);
    val signaturesCount = cs.loadUint(8);
    val signatures: map<uint8, Signature> = createMapFromLowLevelDict(cs.loadDict());
    // make a copy of the remaining slice to calculate the hash of VAA
    var cs_copy = cs;
    // load VAA data without payload
    val part1 = cs_copy.loadBits(408);
    var parts = createEmptyTuple();
    parts.push(part1);
    // split payload cell to tuple of slices
    parts = splitChainOfCellsToTuple(cs_copy.loadRef().beginParse(), parts);
    // apply keccak256 to the tuple of slices
    val vaaHash = keccak256_tuple(parts);
    val vm = VM {
        version,
        guardianSetIndex,
        signatures,
        signaturesCount,
        timestamp: cs.loadUint(32),
        nonce: cs.loadUint(32),
        emitterChainId: cs.loadUint(16),
        emitterAddress: cs.loadUint(256),
        sequence: cs.loadUint(64),
        consistencyLevel: cs.loadUint(8),
        payload: cs.loadRef(),
    };
    cs.assertEnd();
    return (vm, vaaHash);
}
/*
int normalize_ecdsa_recovery_id(int v) inline {
    ;; "compressed recovery_id for pub key"
    if v >= 31 {
        return v - 31;
    }

    ;; "uncompressed recovery_id for pub key"
    if v >= 27 {
        return v - 27;
    }

    return v;
}
*/
@inline
fun recoverAddress(x1: uint256, x2: uint256): uint256 {
    var pubHash = keccak256(beginCell().storeUint(x1, 256).storeUint(x2, 256));
    return pubHash & ((1 << 160) - 1);
}

fun verifyVmSignatures(
    vmHash: uint256,
    guardianSet: GuardianSet,
    signatures: map<uint8, Signature>,
    signaturesCount: uint8,
): bool {
    var lastIndex = 0;
    var value = signatures.findFirst();
    while (value.isFound) {
        val sigData = value.loadValue();
        val i = value.getKey();
        var signature = sigData.signature as slice;
        val guardianIndex = sigData.guardianIndex;

        val (v, r, s) = (signature.loadUint(8), signature.loadUint(256), signature.loadUint(256));
        val (h: uint256, x1: uint256, x2: uint256, valid: bool) = ecrecover(vmHash, v, r, s);
        assert (valid) throw ERROR_ECRECOVER_FAILED;
        assert (
            i == 0 || guardianIndex > lastIndex
        ) throw ERROR_SGINATURE_INDICES_MUST_BE_ASCENDING;
        lastIndex = guardianIndex;
        assert (guardianIndex < guardianSet.count) throw ERROR_GUARDIAN_INDEX_OUT_OF_BOUNDS;
        val signatory = recoverAddress(x1, x2);
        assert (signatory == guardianSet.keys.mustGet(guardianIndex)) throw ERROR_INVALID_SIGNATURE;
        value = signatures.iterateNext(value);
    }
    return true;
}

@inline
fun splitChainOfCellsToTuple(cs: slice, t: tuple): tuple {
    while (!cs.isEndOfRefs()) {
        var next = cs.loadRef().beginParse();
        t.push(cs);
        cs = next;
    }
    t.push(cs);
    return t;
}
