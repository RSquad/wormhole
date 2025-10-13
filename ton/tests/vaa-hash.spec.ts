import { compile } from '@ton/blueprint';
import { Blockchain, SandboxContract } from '@ton/sandbox';
import { Wormhole } from '../wrappers/Wormhole';
import { Cell, toNano } from '@ton/core';
import { Random } from './TestUtils';
import { GOVERNANCE_CHAIN_ID, GOVERNANCE_CONTRACT, GUARDIAN_SET_EXPIRY, TON_CHAIN_ID } from '../wrappers/Constants';
import { createEmptyGuardianSet, createEmptySequences, parseVaa, VAAtoCell } from '../wrappers/Structs';
import { splitBufferToCells } from '../wrappers/conversion';

describe('Calculate VAA hash', () => {
    let blockchain: Blockchain;
    let wormhole: SandboxContract<Wormhole>;

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
                    guardianSets: createEmptyGuardianSet(),
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

    it.each([{
        vaaBase64: "AQAAAAQNAMeiEnnJWMI8r1FnXiBk4pn8BI/rFORIP5I0Mzp0+yA1Jik+J8i6/VGI7XK7t9SGaYzHj6i6AFdKaASLOGQe4nkAAf9284NqC+TmcLWS64vD6iJMVzJBEuGQRdjNP7OzXkShEwDdlluQfYAA7+dTt9I/S7qO/iRjDU2JOHjOEG1BqKQBAg/GXIWUYM6EsI9nmCJ4BzlvHytjg8dk6tSs/qAa6JqCWihqxuh1D6UavMmLSZ7jqkudsXK2C46fJGwtmJVjCLgAA9EZBtkrlkXBdKHFgHMnUm4QK/16NkQsGP/C0bLSVe8dEw1RYTweX0dKA4i9VhYTFz2TtraMGvX8CfseUNl1jXwBBdSCk08HvePemRv+gTOudmqsHFW314qNSX1S92xCf6MRPcE2Oug4HgXySUBAuzYm/BfWbkf30WzAJpl5xVShdk0ABm0Tx2ZqfHrjVRwWW2XTvzmDf/5d/FCibzrxWgBXWnnSEuGFsM0lo2A6zMi7d8ywMu4WjQjo4Fi6F72ObU/OIdMBCt7nxjqiw0jOU2JdoSvlDhDgyJpIh/uXGigrKQ1ceuP2GWuHAyNYtQZsYMxNywnPF0Tj1lBCB16VxSwE6Q45BfkADM2HiTXB7eNEDG8D8rMqDV7wCWiS3Vstkb+9/vGG/bf5arNsuqQcXI4vnyPwrwxeb/h/h9hxBvR6vUICqaOaVU4ADU9F+uYiOQ3Gm7sh1MLBNrd/1bIqkkfwdDssTrxz1YY+Ak0YTkOG3qOThKpXdbkaMsgXXzIUp0E4jWBOS+AuQbwBDrrASflg3WvTi07cRKND7M7T+oy43qC4y7VBIX52ftX+DBYTVB50Pq4/eOX44SK0LgbVew0iiRL8/LtMOptv/+IAEIpN6jSG+PQrf9ORf8dJ/r6Wg8wxkUkxXFRYdBmj7nc3HNTb4JmWcceLzxZ0zLhUN2ScAhzu+R8I/21/cDBc3RsAEezNuPHURHFwbGmhJ74ReKywpJDv+C9+zAnEZ7O7Q2U0AfsOJplbk5FI8jUrRRaNisAad09Fx8XLGtlwUG3MMDQAEjYR5Kux4Hhys+ChdT/8tJCjuKGZCheCbdQLLpClHckEaVEvha40OCAJoLBRhJS4fksbbIt2cKD490zmY2y5lj4AaOvvP/laAQAAAgAAAAAAAAAAAAAAAD7hiyIUr/lwANl0z2R+fDR+j6WFAAAAAAAIvpsBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOjUpRAAAAAAAAAAAAAAAAAAktbB4x4UUg5namh/CpN4i3Fr7/UAAtAr7HPm6vAEngt9NxE9qIEKzOnMjFw8RxC+j4FbQIJFAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
        vaaHash: "88e4c87550966f11f83d40672d7b87098ce19b0ef07201a3ab53afb56d657043" //03edf799241c97d83bcbff1d994af214dba611c9ad57c7e388eecfba3b03dd96
    }])('hash for VAA', async ({ vaaBase64, vaaHash }) => {
        const vaaBuf = parseVaa(Buffer.from(vaaBase64, "base64"));
        const vmCell = VAAtoCell(vaaBuf, splitBufferToCells);
        const vaa = await wormhole.getParseVM(vmCell);
        expect(vaa.hash.toString('hex')).toBe(vaaHash);
        console.log(vaa);

    });
});