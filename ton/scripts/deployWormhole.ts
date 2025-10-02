import { toNano } from '@ton/core';
import { Wormhole } from '../wrappers/Wormhole';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const wormhole = provider.open(
        Wormhole.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
                counter: 0,
            },
            await compile('Wormhole')
        )
    );

    await wormhole.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(wormhole.address);

    console.log('ID', await wormhole.getID());
}
