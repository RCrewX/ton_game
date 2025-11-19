import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { Map } from '../wrappers/Map';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Map', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Map');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let map: SandboxContract<Map>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        map = blockchain.openContract(Map.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await map.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: map.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and map are ready to use
    });
});
