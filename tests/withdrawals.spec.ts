import { Cell, toNano } from '@ton/core';
import { SandboxContract, TreasuryContract } from '@ton/sandbox';
import { CoordinateCell } from '../wrappers/game/CoordinateCell';
import '@ton/test-utils';
import { Opcodes } from '../wrappers/game/types';
import { JettonMinter } from '../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../wrappers/jetton/JettonWallet';
import { jettonContentToCell } from '../wrappers/jetton/JettonMinter';
import { ContractSystem, initContractSystem, setupCoordinateCellWithFirstExplorer } from './test_utils';
import { BASIC_STORAGE_TAX } from '../wrappers/game/types';


describe('Withdrawals', () => {
    let SC_System: ContractSystem;
    let otherUser: SandboxContract<TreasuryContract>;
    let recipient: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        SC_System = await initContractSystem();
        otherUser = await SC_System.blockchain.treasury('otherUser');
        recipient = await SC_System.blockchain.treasury('recipient');
    }, 100000);

    describe('TON Withdrawal', () => {
        it('should allow firstExplorer to withdraw TON', async () => {
            const { coordinateCell } = await setupCoordinateCellWithFirstExplorer(SC_System, { x: 0n, y: 1n });

            // Send TON to CoordinateCell
            const sendAmount = toNano('1');
            await SC_System.ownerAccount.send({
                to: coordinateCell.address,
                value: sendAmount,
                body: Cell.EMPTY,
            });

            const balanceBefore = await coordinateCell.getTonBalance();
            expect(balanceBefore).toBeGreaterThanOrEqual(sendAmount - BASIC_STORAGE_TAX * 2n);

            // Withdraw TON
            const withdrawAmount = toNano('0.5');
            SC_System.messageResult = await coordinateCell.sendWithdrawTON(
                SC_System.ownerAccount.getSender(),
                toNano('0.1'),
                recipient.address,
                withdrawAmount
            );

            expect(SC_System.messageResult.transactions).toHaveTransaction({
                from: SC_System.ownerAccount.address,
                to: coordinateCell.address,
                success: true,
                op: Opcodes.OP_WITHDRAW_TON,
            });

            expect(SC_System.messageResult.transactions).toHaveTransaction({
                from: coordinateCell.address,
                to: recipient.address,
                success: true,
                op: Opcodes.OP_RETURN_EXCESSES_BACK,
            });

            const balanceAfter = await coordinateCell.getTonBalance();
            // Should have at least 0.1 TON remaining
            expect(balanceAfter).toBeGreaterThanOrEqual(toNano('0.1'));
        });

        it('should not allow withdrawal that would leave less than 0.1 TON', async () => {
            const { coordinateCell } = await setupCoordinateCellWithFirstExplorer(SC_System, { x: 0n, y: 1n });

            // Send TON to CoordinateCell
            const sendAmount = toNano('0.5');
            await SC_System.ownerAccount.send({
                to: coordinateCell.address,
                value: sendAmount,
                body: Cell.EMPTY,
            });

            const balanceBefore = await coordinateCell.getTonBalance();
            
            // Try to withdraw more than allowed (would leave less than 0.1 TON)
            const withdrawAmount = balanceBefore - toNano('0.05') + sendAmount; // Would leave only 0.05 TON
            SC_System.messageResult = await coordinateCell.sendWithdrawTON(
                SC_System.ownerAccount.getSender(),
                sendAmount,
                recipient.address,
                withdrawAmount
            );

            expect(SC_System.messageResult.transactions).toHaveTransaction({
                from: SC_System.ownerAccount.address,
                to: coordinateCell.address,
                success: false,
                op: Opcodes.OP_WITHDRAW_TON,
            });
        });

        it('should not allow non-firstExplorer to withdraw TON', async () => {
            const { coordinateCell } = await setupCoordinateCellWithFirstExplorer(SC_System, { x: 0n, y: 1n });

            // Send TON to CoordinateCell
            await SC_System.ownerAccount.send({
                to: coordinateCell.address,
                value: toNano('1'),
                body: Cell.EMPTY,
            });

            // Try to withdraw as other user
            SC_System.messageResult = await coordinateCell.sendWithdrawTON(
                otherUser.getSender(),
                toNano('0.1'),
                recipient.address,
                toNano('0.5')
            );

            expect(SC_System.messageResult.transactions).toHaveTransaction({
                from: otherUser.address,
                to: coordinateCell.address,
                success: false,
                op: Opcodes.OP_WITHDRAW_TON,
            });
        });
    });

    describe('Jetton Withdrawal', () => {
        it('should allow firstExplorer to withdraw jettons', async () => {
            const { coordinateCell } = await setupCoordinateCellWithFirstExplorer(SC_System, { x: 0n, y: 1n });

            // Deploy jetton minter
            const jettonContent = jettonContentToCell({ type: 1, uri: 'https://example.com/jetton.json' });
            const jettonMinter = SC_System.blockchain.openContract(JettonMinter.createFromConfig({
                admin: SC_System.ownerAccount.address,
                content: jettonContent,
                wallet_code: SC_System.jettonWalletCode,
            }, SC_System.jettonMinterCode));

            await jettonMinter.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

            // Calculate CoordinateCell's jetton wallet address
            const coordinateCellJettonWalletAddress = await jettonMinter.getWalletAddress(coordinateCell.address);
            const coordinateCellJettonWallet = SC_System.blockchain.openContract(
                JettonWallet.createFromAddress(coordinateCellJettonWalletAddress)
            );

            // Mint jettons to CoordinateCell
            await jettonMinter.sendMint(
                SC_System.ownerAccount.getSender(),
                coordinateCell.address,
                toNano('1000'), // jetton amount
                toNano('0.1'), // forward amount
                toNano('0.2') // total amount
            );

            // Check jetton balance
            const balanceBefore = await coordinateCellJettonWallet.getJettonBalance();
            expect(balanceBefore).toBeGreaterThan(0n);

            // Withdraw jettons
            const withdrawAmount = toNano('100');
            SC_System.messageResult = await coordinateCell.sendWithdrawJetton(
                SC_System.ownerAccount.getSender(),
                toNano('0.2'),
                coordinateCellJettonWallet.address,
                recipient.address,
                withdrawAmount,
                toNano('0.1')
            );

            expect(SC_System.messageResult.transactions).toHaveTransaction({
                from: SC_System.ownerAccount.address,
                to: coordinateCell.address,
                success: true,
                op: Opcodes.OP_WITHDRAW_JETTON,
            });

            // Should send AskToTransfer to jetton wallet
            expect(SC_System.messageResult.transactions).toHaveTransaction({
                from: coordinateCell.address,
                to: coordinateCellJettonWallet.address,
                success: true,
            });

            // Check recipient received jettons
            const recipientWalletAddress = await jettonMinter.getWalletAddress(recipient.address);
            const recipientWallet = SC_System.blockchain.openContract(
                JettonWallet.createFromAddress(recipientWalletAddress)
            );
            const recipientBalance = await recipientWallet.getJettonBalance();
            expect(recipientBalance).toBeGreaterThanOrEqual(withdrawAmount);
        });

        it('should not allow non-firstExplorer to withdraw jettons', async () => {
            const { coordinateCell } = await setupCoordinateCellWithFirstExplorer(SC_System, { x: 0n, y: 1n });

            // Deploy jetton minter
            const jettonContent = jettonContentToCell({ type: 1, uri: 'https://example.com/jetton.json' });
            const jettonMinter = SC_System.blockchain.openContract(JettonMinter.createFromConfig({
                admin: SC_System.ownerAccount.address,
                content: jettonContent,
                wallet_code: SC_System.jettonWalletCode,
            }, SC_System.jettonMinterCode));

            await jettonMinter.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

            // Mint jettons to CoordinateCell
            await jettonMinter.sendMint(
                SC_System.ownerAccount.getSender(),
                coordinateCell.address,
                toNano('1000'),
                toNano('0.1'),
                toNano('0.2')
            );

            // Calculate CoordinateCell's jetton wallet address
            const coordinateCellJettonWalletAddress = await jettonMinter.getWalletAddress(coordinateCell.address);

            // Try to withdraw as other user
            SC_System.messageResult = await coordinateCell.sendWithdrawJetton(
                otherUser.getSender(),
                toNano('0.2'),
                coordinateCellJettonWalletAddress,
                recipient.address,
                toNano('100'),
                toNano('0.1')
            );

            expect(SC_System.messageResult.transactions).toHaveTransaction({
                from: otherUser.address,
                to: coordinateCell.address,
                success: false,
                op: Opcodes.OP_WITHDRAW_JETTON,
            });
        });
    });
});

