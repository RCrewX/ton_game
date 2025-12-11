import { toNano } from '@ton/core';
import { CoordinateCell } from '../wrappers/game/CoordinateCell';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const coordinateCell = provider.open(CoordinateCell.createFromConfig({}, await compile('CoordinateCell')));

    await coordinateCell.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(coordinateCell.address);

    // run methods on `coordinateCell`
}
