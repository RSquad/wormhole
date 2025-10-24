import { toNano, Address } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Executor } from '../wrappers/Executor';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const code = await compile('Executor');

    const executor = provider.open(
        Executor.createFromConfig({}, code),
    );

    const value = toNano('0.1');
    await executor.sendDeploy(provider.sender(), value);
    await provider.waitForDeploy(executor.address);

    ui.write(`Executor deployed at ${executor.address.toString()}`);
}


