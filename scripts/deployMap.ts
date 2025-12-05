import { toNano } from '@ton/core';
import { Game } from '../wrappers/Game';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const map = provider.open(Game.createFromConfig({}, await compile('Map')));

    await map.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(map.address);

    // run methods on `map`
}
