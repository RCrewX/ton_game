import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { Game } from '../wrappers/Game';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Ship } from '../wrappers/Ship';
import { ContractSystem, initContractSystem } from './test_utils';

describe('Game', () => {
    let SC_System: ContractSystem;
    beforeEach(async () => {
        // Create Sandbox and deploy contracts
        SC_System = await initContractSystem();
    })

    it('Get Ship, pop-up ship, move UP', async () => {
        // SC_System.messageResult = SC_System.ownerAccount.;
    });
});
