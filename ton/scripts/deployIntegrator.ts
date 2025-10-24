import { toNano, Address } from '@ton/core';
import { Integrator } from '../wrappers/Integrator';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Random } from '../tests/TestUtils';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const envWormhole = process.env.WORMHOLE_ADDRESS;
    const envExecutor = process.env.EXECUTOR_ADDRESS;
    const wormholeAddress = envWormhole ? Address.parse(envWormhole) : await ui.inputAddress('Wormhole address');
    const executorAddress = envExecutor ? Address.parse(envExecutor) : await ui.inputAddress('Executor address');
    const integrator = provider.open(
        Integrator.createFromConfig(
            {
                id: Random.id(16),
                nonce: 0,
                wormholeAddress,
                executorAddress,
            },
            await compile('Integrator'),
        ),
    );

    await integrator.sendDeploy(provider.sender(), toNano(0.1));

    await provider.waitForDeploy(integrator.address);

    ui.write(`Integrator deployed at ${integrator.address.toString()}`);
}
