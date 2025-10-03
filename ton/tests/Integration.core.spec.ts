import { Blockchain, BlockchainSnapshot, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, Dictionary, toNano } from '@ton/core';
import { Integrator } from '../wrappers/Integrator';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { GuardianSetDictionaryValue, Wormhole } from '../wrappers/Wormhole';
import { makeRandomId, makeRandomKeyPair, makeRandomKeyPairs, mapKeyPairsToXOnlyPublicKeys, now, toXOnly } from './TestUtils';
import { createEmptyGuardianSet } from '../wrappers/Structs';
import { findTransactionRequired } from '@ton/test-utils';
import { Events, Opcodes, toAnswer } from '../wrappers/Constants';

const NUM_GUARDIANS = 19;

describe('Integrator', () => {
    let integratorCode: Cell;
    let wormholeCode: Cell;

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let recipient: SandboxContract<TreasuryContract>;
    let integrator: SandboxContract<Integrator>;
    let wormhole: SandboxContract<Wormhole>;
    const keys = makeRandomKeyPairs(NUM_GUARDIANS);
    const guardianSetIndex = 0;

    let snapshot1: BlockchainSnapshot;

    beforeAll(async () => {
        integratorCode = await compile('Integrator');
        wormholeCode = await compile('Wormhole');

        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        recipient = await blockchain.treasury('recipient');

        const publicKeys = mapKeyPairsToXOnlyPublicKeys(keys);
        const guardianSets = createEmptyGuardianSet();
        guardianSets.set(guardianSetIndex, { keys: publicKeys, expirationTime: now(60) });
        wormhole = blockchain.openContract(
            Wormhole.createFromConfig(
                {
                    id: makeRandomId(16),
                    messageFee: toNano(0.1),
                    sequences: Dictionary.empty(),
                    guardianSets,
                    guardianSetIndex,
                    guardianSetExpiry: now(60),
                    chainId: 0,
                    governanceChainId: 0,
                    governanceContract: Buffer.alloc(32),
                },
                wormholeCode,
            ),
        );

        let deployResult = await wormhole.sendDeploy(deployer.getSender(), toNano('1'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: wormhole.address,
            deploy: true,
            success: true,
        });

        integrator = blockchain.openContract(Integrator.createFromConfig({ 
            id: makeRandomId(16), 
            wormholeAddress: wormhole.address,
        }, integratorCode));

        deployResult = await integrator.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: integrator.address,
            deploy: true,
            success: true,
        });

        snapshot1 = await blockchain.snapshot();
    });

    beforeEach(async () => {
        blockchain.loadFrom(snapshot1);
    });

    it('should send comment', async () => {
        // the check is done inside beforeEach
        // blockchain and integrator are ready to use
        const result = await integrator.sendComment(user.getSender(), toNano(0.15), {
            queryId: 0xdeadbeef,
            nonce: 0xbadf00d,
            consistencyLevel: 0,
            to: recipient.address,
            comment: 'test comment',
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: integrator.address,
            success: true,
            op: Opcodes.OP_SEND_COMMENT,
        });
        expect(result.transactions).toHaveTransaction({
            from: integrator.address,
            to: wormhole.address,
            success: true,
            op: Opcodes.OP_PUBLISH_MESSAGE,
        });
        expect(result.transactions).toHaveTransaction({
            from: wormhole.address,
            to: integrator.address,
            success: true,
            op: toAnswer(Opcodes.OP_PUBLISH_MESSAGE),
        });

        const tx = findTransactionRequired(result.transactions, {
            from: integrator.address,
            to: wormhole.address,
            success: true,
        });
        const event = tx.outMessages.values().find((msg) => msg.info.type === 'external-out');
        expect(event).toBeDefined();
        const eventBody = event!.body.beginParse();
        expect(eventBody.loadUint(32)).toBe(Events.EVENT_PUBLISH_MESSAGE);
    });
});

