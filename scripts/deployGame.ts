import { toNano } from '@ton/core';
import { Game } from '../wrappers/Game';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const game = provider.open(Game.createFromConfig({}, await compile('Game')));

    await game.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(game.address);

    // run methods on `game`
}
