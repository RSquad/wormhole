import { compile } from '@ton/blueprint';
import { Blockchain, SandboxContract } from '@ton/sandbox';
import { Wormhole } from '../wrappers/Wormhole';
import { toNano } from '@ton/core';
import { Random } from './TestUtils';
import { GOVERNANCE_CHAIN_ID, GOVERNANCE_CONTRACT, GUARDIAN_SET_EXPIRY, TON_CHAIN_ID } from '../wrappers/Constants';
import { createEmptyGuardianSet, createEmptySequences, parseVaa, VAAtoCell } from '../wrappers/Structs';
import { splitBufferToCells } from '../wrappers/conversion';
import vaas from './samples/vaas.json';
import guardianSet from './samples/guardian-set.json';

describe('Calculate VAA hash', () => {
    let blockchain: Blockchain;
    let wormhole: SandboxContract<Wormhole>;
    let guardianSetIndex = guardianSet.index;
    let guardianSetKeys = guardianSet.addresses.map((address) =>
        Buffer.from(address.slice(2).padStart(64, '0'), 'hex'),
    );
    const guardianSets = createEmptyGuardianSet();
    guardianSets.set(guardianSetIndex, { keys: guardianSetKeys, expirationTime: GUARDIAN_SET_EXPIRY });

    beforeAll(async () => {
        const code = await compile('Wormhole');
        blockchain = await Blockchain.create();
        const deployer = await blockchain.treasury('deployer');
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

    it.each([...vaas])('hash for VAA', async ({ vaaBase64, vaaHash }) => {
        const vaaBuf = parseVaa(Buffer.from(vaaBase64, 'base64'));
        const vmCell = VAAtoCell(vaaBuf, splitBufferToCells);
        const vaa = await wormhole.getParseVM(vmCell);
        expect(vaa.hash.toString('hex')).toBe(vaaHash);
    });
});
