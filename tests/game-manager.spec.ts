import { beginCell, toNano } from '@ton/core';
import { SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { ContractSystem, initContractSystem } from './test_utils';

describe('GameManager', () => {
    let SC_System: ContractSystem;
    beforeEach(async () => {
        SC_System = await initContractSystem();
    }, 100000);

    it('Test GameManager message redirection - owner can redirect messages to any address', async () => {
        const recipient = await SC_System.blockchain.treasury('redirectRecipient');
        const testMessage = beginCell()
            .storeUint(0x12345678, 32)
            .storeUint(42, 64)
            .endCell();

        SC_System.messageResult = await SC_System.gameManager.sendRedirectMessage(
            SC_System.ownerAccount.getSender(),
            toNano('0.1'),
            recipient.address,
            testMessage,
            toNano('0.05')
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: recipient.address,
            success: true,
        });
    });
});

