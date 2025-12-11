import { toNano } from '@ton/core';
import { Ship } from '../wrappers/game/Ship';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const ship = provider.open(Ship.createFromConfig({}, await compile('Ship')));

    await ship.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(ship.address);

    // run methods on `ship`
}
