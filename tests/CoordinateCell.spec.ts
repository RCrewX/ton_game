import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { CoordinateCell } from '../wrappers/CoordinateCell';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('CoordinateCell', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('CoordinateCell');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let coordinateCell: SandboxContract<CoordinateCell>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        coordinateCell = blockchain.openContract(CoordinateCell.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await coordinateCell.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: coordinateCell.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and coordinateCell are ready to use
    });
});
