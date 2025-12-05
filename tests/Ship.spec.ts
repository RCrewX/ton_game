import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { Ship } from '../wrappers/Ship';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Ship', () => {
    let shipCode: Cell;
    let coordinateCellCode: Cell;
    let gameCode: Cell;

    beforeAll(async () => {
        gameCode = await compile('Game');
        shipCode = await compile('Ship');
        coordinateCellCode = await compile('CoordinateCell');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let ship: SandboxContract<Ship>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        // ship = blockchain.openContract(Ship.createFromConfig({
        //     userAddress: deployer.address,
        //     // gameAddress: gameCode,
        //     coordinateCellCode,
        // }, shipCode));


        // const deployResult = await ship.sendDeploy(deployer.getSender(), toNano('0.05'));

        // expect(deployResult.transactions).toHaveTransaction({
        //     from: deployer.address,
        //     to: ship.address,
        //     deploy: true,
        //     success: true,
        // });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and ship are ready to use
    });
});
