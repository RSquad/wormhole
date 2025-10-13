import { NetworkProvider } from '@ton/blueprint';
import { Integrator } from '../wrappers/Integrator';
import { Address, toNano } from '@ton/core';
import { Wormhole } from '../wrappers/Wormhole';
import fs from 'fs';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const comment = await ui.input('Enter comment:');
    const to = Buffer.from(await ui.input('Enter to address:'), 'hex');
    const chainId = parseInt(await ui.input('Enter chain id:'), 10);

    const contracts = fs.readFileSync('contracts.json', 'utf8');
    const contractsJson = JSON.parse(contracts);

    const integrator = provider.open(Integrator.createFromAddress(Address.parse(contractsJson.integrator)));
    const wormhole = provider.open(Wormhole.createFromAddress(Address.parse(contractsJson.wormhole)));
    const fee = await wormhole.getMessageFee();
    await integrator.sendComment(provider.sender(), toNano(0.1) + fee, {
        queryId: 0,
        consistencyLevel: 0,
        chainId,
        to,
        comment,
    });

    console.log('Done');
}
