import { beginCell, toNano } from '@ton/core';
import { SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { ContractSystem, initContractSystem } from './test_utils';
import { Subcontract } from '../wrappers/subcontract/Subcontract';
import { GAS_COST_REDIRECT_MESSAGE, encodeRedirectMessage } from '../wrappers/subcontract/types';
import { Ship } from '../wrappers/game/Ship';
import { MoveMode } from '../wrappers/game/structs';
import { encodeRequestToMove } from '../wrappers/game/types';
import { Opcodes } from '../wrappers/game/types';
import { JettonMinter, jettonContentToCell } from '../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../wrappers/jetton/JettonWallet';

describe('Subcontract', () => {
    let SC_System: ContractSystem;
    beforeEach(async () => {
        SC_System = await initContractSystem();
    }, 100000);

    it('Test Subcontract basic redirection - owner can redirect messages to any address', async () => {
        const subcontractId = 1n;
        
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        const recipient = await SC_System.blockchain.treasury('redirectRecipient');
        const testMessage = beginCell()
            .storeUint(0x12345678, 32)
            .storeUint(42, 64)
            .endCell();

        const forwardAmount = toNano('0.05');
        // Need to send gas cost + forward amount for redirect message
        SC_System.messageResult = await subcontract.sendRedirectMessage(
            SC_System.ownerAccount.getSender(),
            GAS_COST_REDIRECT_MESSAGE + forwardAmount,
            recipient.address,
            testMessage,
            forwardAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: subcontract.address,
            success: true,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: subcontract.address,
            to: recipient.address,
            success: true,
        });
    });

    it('Test Subcontract jetton transfer redirection', async () => {
        const subcontractId = 2n;
        
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        // Create a recipient for jetton transfer
        const recipient = await SC_System.blockchain.treasury('jettonRecipient');
        const recipientJettonWalletAddress = await SC_System.jettonMinter.getWalletAddress(recipient.address);
        const recipientJettonWallet = SC_System.blockchain.openContract(
            JettonWallet.createFromConfig({
                ownerAddress: recipient.address,
                minterAddress: SC_System.jettonMinter.address,
            }, SC_System.jettonWalletCode)
        );

        // Create transfer message (AskToTransfer)
        const transferAmount = toNano('100');
        const forwardAmount = toNano('0.1');
        const transferMessage = beginCell()
            .storeUint(0x0f8a7ea5, 32) // AskToTransfer opcode
            .storeUint(0, 64) // queryId
            .storeCoins(transferAmount) // jettonAmount
            .storeAddress(recipient.address) // transferRecipient
            .storeAddress(null) // sendExcessesTo
            .storeMaybeRef(null) // customPayload
            .storeCoins(forwardAmount) // forwardTonAmount
            .storeRef(beginCell().endCell()) // forwardPayload
            .endCell();

        // Redirect through subcontract to owner's jetton wallet
        SC_System.messageResult = await subcontract.sendRedirectMessage(
            SC_System.ownerAccount.getSender(),
            GAS_COST_REDIRECT_MESSAGE + forwardAmount,
            SC_System.ownerJettonWallet.address,
            transferMessage,
            forwardAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: subcontract.address,
            success: true,
        });

        // Verify message was redirected (even if wallet rejects it, the redirection happened)
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: subcontract.address,
            to: SC_System.ownerJettonWallet.address,
        });
    });

    it('Test Subcontract move redirection to ship', async () => {
        const subcontractId = 3n;
        
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        // Create a ship with subcontract address as userAddress
        const shipForSubcontract = SC_System.blockchain.openContract(Ship.createFromConfig({
            userAddress: subcontract.address,
            gameAddress: SC_System.game.address,
            coordinateCellCode: SC_System.coordinateCellCode,
        }, SC_System.shipCode));

        await shipForSubcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('5'));

        // Create RequestToMove message
        const moveMessage = encodeRequestToMove({ mode: MoveMode.UP });
        const forwardAmount = toNano('1'); // Enough for ship move operation

        // Redirect move request through subcontract to ship
        SC_System.messageResult = await subcontract.sendRedirectMessage(
            SC_System.ownerAccount.getSender(),
            GAS_COST_REDIRECT_MESSAGE + forwardAmount,
            shipForSubcontract.address,
            moveMessage,
            forwardAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: subcontract.address,
            success: true,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: subcontract.address,
            to: shipForSubcontract.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_MOVE,
        });

        // Verify ship processed the move
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            to: shipForSubcontract.address,
            success: true,
            op: Opcodes.OP_MOVE_END,
        });
    });

    it('Test Subcontract unauthorized access - non-owner cannot redirect', async () => {
        const subcontractId = 4n;
        
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        // Create unauthorized sender
        const unauthorizedAccount = await SC_System.blockchain.treasury('unauthorized');
        const recipient = await SC_System.blockchain.treasury('recipient');
        const testMessage = beginCell()
            .storeUint(0x12345678, 32)
            .storeUint(42, 64)
            .endCell();

        const forwardAmount = toNano('0.05');
        
        // Try to redirect as unauthorized user - should fail
        SC_System.messageResult = await subcontract.sendRedirectMessage(
            unauthorizedAccount.getSender(),
            GAS_COST_REDIRECT_MESSAGE + forwardAmount,
            recipient.address,
            testMessage,
            forwardAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: unauthorizedAccount.address,
            to: subcontract.address,
            success: false,
            exitCode: 901, // ERR_UNAUTHORIZED
        });
    });

    it('Test Subcontract getters', async () => {
        const subcontractId = 5n;
        
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        const ownerAddress = await subcontract.getOwnerAddress();
        const id = await subcontract.getId();

        expect(ownerAddress).toEqualAddress(SC_System.ownerAccount.address);
        expect(id).toBe(subcontractId);

        // Test getting address of owned subcontract
        const ownedSubcontractId = 10n;
        const ownedSubcontractAddress = await subcontract.getSubcontractAddress(ownedSubcontractId);
        
        // Verify the address matches the calculated address
        const expectedSubcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: subcontract.address,
            id: ownedSubcontractId,
        }, SC_System.subcontractCode));
        
        expect(ownedSubcontractAddress).toEqualAddress(expectedSubcontract.address);
    });

    it('Test nested subcontracts - owner -> subcontract -> subcontract -> ship', async () => {
        // Create first level subcontract (owned by owner)
        const firstLevelId = 100n;
        const firstLevelSubcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: firstLevelId,
        }, SC_System.subcontractCode));

        await firstLevelSubcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        // Get address of second level subcontract (owned by first level)
        const secondLevelId = 200n;
        const secondLevelSubcontractAddress = await firstLevelSubcontract.getSubcontractAddress(secondLevelId);
        
        // Create and deploy second level subcontract
        const secondLevelSubcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: firstLevelSubcontract.address,
            id: secondLevelId,
        }, SC_System.subcontractCode));

        await secondLevelSubcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        // Verify the address matches
        expect(secondLevelSubcontractAddress).toEqualAddress(secondLevelSubcontract.address);

        // Create ship owned by second level subcontract
        const shipForNestedSubcontract = SC_System.blockchain.openContract(Ship.createFromConfig({
            userAddress: secondLevelSubcontract.address,
            gameAddress: SC_System.game.address,
            coordinateCellCode: SC_System.coordinateCellCode,
        }, SC_System.shipCode));

        await shipForNestedSubcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('5'));

        // Create RequestToMove message
        const moveMessage = encodeRequestToMove({ mode: MoveMode.UP });
        const forwardAmount = toNano('1');

        // Create RedirectMessage to be sent to second level subcontract (which will forward to ship)
        const redirectToShipMessage = encodeRedirectMessage({
            queryId: 0n,
            destination: shipForNestedSubcontract.address,
            messageBody: moveMessage,
            forwardTonAmount: forwardAmount,
        });

        // Redirect through first level subcontract to second level subcontract
        // The body contains a RedirectMessage that second level will forward to ship
        SC_System.messageResult = await firstLevelSubcontract.sendRedirectMessage(
            SC_System.ownerAccount.getSender(),
            GAS_COST_REDIRECT_MESSAGE + forwardAmount,
            secondLevelSubcontract.address,
            redirectToShipMessage,
            forwardAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: firstLevelSubcontract.address,
            success: true,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: firstLevelSubcontract.address,
            to: secondLevelSubcontract.address,
            success: true,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: secondLevelSubcontract.address,
            to: shipForNestedSubcontract.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_MOVE,
        });

        // Verify ship processed the move
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            to: shipForNestedSubcontract.address,
            success: true,
            op: Opcodes.OP_MOVE_END,
        });
    });
});

