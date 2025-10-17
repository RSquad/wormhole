import { compile } from '@ton/blueprint';
import { Blockchain, SandboxContract } from '@ton/sandbox';
import { Wormhole } from '../wrappers/Wormhole';
import { beginCell, Cell, toNano } from '@ton/core';
import { GOVERNANCE_CHAIN_ID, GOVERNANCE_CONTRACT, GUARDIAN_SET_EXPIRY, TON_CHAIN_ID } from '../wrappers/Constants';
import { Random, generateVAA, Crypto } from './TestUtils';
import { createEmptyGuardianSet, createEmptySequences, parseVaa, VAAtoCell } from '../wrappers/Structs';
import { splitBufferToCells } from '../wrappers/conversion';
import guardianSet from './samples/guardian-set.json';
import vaas from './samples/vaas.json';
import { sha256_sync } from '@ton/crypto';

describe('Verify VAA signatures', () => {
    let blockchain: Blockchain;
    let code: Cell;
    let wormhole: SandboxContract<Wormhole>;
    const guardianSetIndex = guardianSet.index;
    const guardianSetKeys = guardianSet.addresses.map(address => Buffer.from(address.slice(2).padStart(64, '0'), 'hex'));

    beforeAll(async () => {
        code = await compile('Wormhole');
        blockchain = await Blockchain.create();
        const deployer = await blockchain.treasury('deployer');
        const guardianSets = createEmptyGuardianSet();
        guardianSets.set(guardianSetIndex, { keys: guardianSetKeys, expirationTime: GUARDIAN_SET_EXPIRY });
        wormhole = blockchain.openContract(
            Wormhole.createFromConfig(
                {
                    id: Random.id(16),
                    messageFee: toNano(0.1),
                    sequences: createEmptySequences(),
                    guardianSets,
                    guardianSetIndex,
                    guardianSetExpiry: GUARDIAN_SET_EXPIRY,
                    chainId: TON_CHAIN_ID,
                    governanceChainId: GOVERNANCE_CHAIN_ID,
                    governanceContract: GOVERNANCE_CONTRACT,
                },
                code,
            ),
        );

        await wormhole.sendDeploy(deployer.getSender(), toNano(1));
    });

    it.each([...vaas])('should succeed verify VAA', async ({ vaaBase64 }) => {
        const parsedVaa = parseVaa(Buffer.from(vaaBase64, "base64"));
        const vmCell = VAAtoCell(parsedVaa, splitBufferToCells);
        const verified = await wormhole.getVerifyVM(vmCell);
        expect(verified).toBe(true);
    });

    it("should fail to verify VAA", async () => {
        const quorum = await wormhole.getQuorum();
        const vmCell = VAAtoCell(generateVAA(guardianSetIndex, quorum, Buffer.from("test payload")), splitBufferToCells);
        const verified = await wormhole.getVerifyVM(vmCell);
        expect(verified).toBe(false);
    });

    describe("Generate signed VAA and verify it", () => {
        const guardianKeys = Array.from({ length: 19 }, () => Crypto.makeRandomKeyPair(false));
        
        const addresses = guardianKeys.map((kp) => {
            return Buffer.concat([Buffer.alloc(12), sha256_sync(Buffer.from(kp.keyPair.publicKey.slice(1))).subarray(12)]);
        });

        beforeAll(async () => {
            const deployer = await blockchain.treasury('deployer');
            const guardianSets = createEmptyGuardianSet();
            guardianSets.set(0, { keys: addresses, expirationTime: GUARDIAN_SET_EXPIRY });
            wormhole = blockchain.openContract(
                Wormhole.createFromConfig(
                    {
                        id: Random.id(16),
                        messageFee: toNano(0.1),
                        sequences: createEmptySequences(),
                        guardianSets,
                        guardianSetIndex: 0,
                        guardianSetExpiry: GUARDIAN_SET_EXPIRY,
                        chainId: TON_CHAIN_ID,
                        governanceChainId: GOVERNANCE_CHAIN_ID,
                        governanceContract: GOVERNANCE_CONTRACT,
                    },
                    code,
                ),
            );
    
            await wormhole.sendDeploy(deployer.getSender(), toNano(1));
        });

        it("should succeed to verify VAA", async () => {
            
        });
    });
});