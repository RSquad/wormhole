import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Dictionary } from '@ton/core';
import { Wormhole } from '../wrappers/Wormhole';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Crypto, Time, generateVAA } from './TestUtils';
import { findTransactionRequired } from '@ton/test-utils';
import { Events, Opcodes, toAnswer } from '../wrappers/Constants';
import { createEmptyGuardianSet, VAAtoCell } from '../wrappers/Structs';
import { splitBufferToCells } from '../wrappers/conversion';

const NUM_GUARDIANS = 19;
const NUM_SIGNATURES = 13;

describe('Wormhole', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Wormhole');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let publisher: SandboxContract<TreasuryContract>;
    let wormhole: SandboxContract<Wormhole>;

    const keys = new Array(NUM_GUARDIANS).fill(0).map(() => Crypto.makeRandomKeyPair());

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        publisher = await blockchain.treasury('publisher');

        const publicKeys = keys.map((key) => Crypto.toXOnly(key.keyPair.publicKey as Buffer));

        const guardianSets = createEmptyGuardianSet();
        guardianSets.set(0, { keys: publicKeys, expirationTime: Time.now(60) });
        wormhole = blockchain.openContract(
            Wormhole.createFromConfig(
                {
                    id: 0,
                    messageFee: toNano(0.1),
                    sequences: Dictionary.empty(),
                    guardianSets,
                    guardianSetIndex: 0,
                    guardianSetExpiry: 0,
                    chainId: 0,
                    governanceChainId: 0,
                    governanceContract: Buffer.alloc(32),
                },
                code,
            ),
        );

        const deployResult = await wormhole.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: wormhole.address,
            deploy: true,
            success: true,
        });
    });

    it('should succeed getMessageFee', async () => {
        const fee = await wormhole.getMessageFee();
        expect(fee).toBe(toNano('0.1'));
    });

    it('should succeed getSequence', async () => {
        const sequence = await wormhole.getSequence(publisher.address);
        expect(sequence).toBe(0);
    });

    it('should succeed verifyVM (return false)', async () => {
        const vmData = generateVAA(0, NUM_SIGNATURES, Buffer.alloc(32));
        const result = await wormhole.getVerifyVM(VAAtoCell(vmData, splitBufferToCells));
        expect(result).toBe(false);
    });

    it('should send publish message with sufficient fee', async () => {
        const messageFee = await wormhole.getMessageFee();

        // Create test payload
        const payload = beginCell().storeUint(0x00000000, 32).storeStringTail('hello, world').endCell();

        const tail = beginCell()
            .storeStringTail('Payload tail')
            .storeRef(beginCell().storeStringTail('this is a reference').endCell())
            .endCell();

        const publishResult = await wormhole.sendPublishMessage(publisher.getSender(), {
            value: messageFee + toNano(0.1),
            queryId: 1,
            nonce: 789,
            consistencyLevel: 1,
            payload,
            tail,
        });

        expect(publishResult.transactions).toHaveTransaction({
            from: publisher.address,
            to: wormhole.address,
            success: true,
            value: messageFee + toNano(0.1),
        });
        expect(publishResult.transactions).toHaveTransaction({
            from: wormhole.address,
            to: publisher.address,
            success: true,
            value: (x?: bigint) => {
                // check that wormhole reserves message feeParseAndVerifyVMAnswer
                return x! < toNano(0.1) && x! > toNano(0.08);
            },
        });

        const trans = findTransactionRequired(publishResult.transactions, {
            to: wormhole.address,
        });
        const event = trans.outMessages.values().find((msg) => msg.info.type === 'external-out');
        expect(event).toBeDefined();
        const eventBody = event!.body.beginParse();
        expect(eventBody.loadUint(32)).toBe(Events.EVENT_MESSAGE_PUBLISHED);
        expect(eventBody.loadAddress().toString()).toBe(publisher.address.toString());
        expect(eventBody.loadUintBig(64)).toBe(0n);
        expect(eventBody.loadUint(32)).toBe(789);
        expect(eventBody.loadUint(8)).toBe(1);
        expect(eventBody.loadRef().hash().toString('hex')).toBe(payload.hash().toString('hex'));

        const sequence = await wormhole.getSequence(publisher.address);
        expect(sequence).toBe(1);
    });

    it('should fail to send publish message with insufficient fee', async () => {
        const messageFee = await wormhole.getMessageFee();

        const payload = beginCell().storeUint(0x00000000, 32).storeStringTail('test payload').endCell();

        const publishResult = await wormhole.sendPublishMessage(publisher.getSender(), {
            value: messageFee - toNano(0.01),
            queryId: 1,
            nonce: 789,
            consistencyLevel: 1,
            payload,
        });

        expect(publishResult.transactions).toHaveTransaction({
            from: publisher.address,
            to: wormhole.address,
            success: false,
            exitCode: 101,
        });
    });

    it('should send parse and verify VM', async () => {
        const verifier = await blockchain.treasury('verifier');
        const vmData = VAAtoCell(generateVAA(0, NUM_SIGNATURES, Buffer.alloc(32)), splitBufferToCells);
        const verifyResult = await wormhole.sendParseAndVerifyVM(verifier.getSender(), {
            value: toNano(0.1),
            queryId: 1,
            encodedVM: vmData,
            tail: beginCell().endCell(),
        });
        expect(verifyResult.transactions).toHaveTransaction({
            from: verifier.address,
            to: wormhole.address,
            success: true,
            op: Opcodes.OP_PARSE_AND_VERIFY_VM,
        });
        expect(verifyResult.transactions).toHaveTransaction({
            from: wormhole.address,
            to: verifier.address,
            success: true,
            op: toAnswer(Opcodes.OP_PARSE_AND_VERIFY_VM),
        });
    });
});
