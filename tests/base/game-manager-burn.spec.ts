import { beginCell, toNano, Address, contractAddress } from '@ton/core';
import { SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { ContractSystem, initContractSystem, cleanupContractSystem } from '../test_utils';
import { GAS_COST_SET_ALLOW_BURN, GAS_COST_REQUEST_BURN, Opcodes, GAS_COST_REDIRECT_MESSAGE } from '../../wrappers/game_manager/types';
import { JettonWallet } from '../../wrappers/jetton/JettonWallet';
import { JettonMinter } from '../../wrappers/jetton/JettonMinter';

describe('GameManager Burn Functionality', () => {
    let SC_System: ContractSystem;
    beforeEach(async () => {
        SC_System = await initContractSystem();
    }, 100000);

    afterEach(() => {
        cleanupContractSystem(SC_System);
        SC_System = null as any;
    });

    it('Test allow_burn defaults to false', async () => {
        const allowBurn = await SC_System.gameManager.getAllowBurn();
        expect(allowBurn).toBe(false);
    });

    it('Test SetAllowBurn can only be called by owner', async () => {
        const nonOwner = await SC_System.blockchain.treasury('nonOwner');
        
        // Try to set allow_burn from non-owner - should fail
        SC_System.messageResult = await SC_System.gameManager.sendSetAllowBurn(
            nonOwner.getSender(),
            GAS_COST_SET_ALLOW_BURN,
            true
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: nonOwner.address,
            to: SC_System.gameManager.address,
            success: false,
            exitCode: 920, // ERR_INVALID_OWNER_SENDER
        });

        // Verify allow_burn is still false
        const allowBurn = await SC_System.gameManager.getAllowBurn();
        expect(allowBurn).toBe(false);
    });

    it('Test owner can set allow_burn to true', async () => {
        SC_System.messageResult = await SC_System.gameManager.sendSetAllowBurn(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SET_ALLOW_BURN,
            true
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
        });

        const allowBurn = await SC_System.gameManager.getAllowBurn();
        expect(allowBurn).toBe(true);
    });

    it('Test owner can set allow_burn to false', async () => {
        // First set to true
        await SC_System.gameManager.sendSetAllowBurn(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SET_ALLOW_BURN,
            true
        );

        // Then set to false
        SC_System.messageResult = await SC_System.gameManager.sendSetAllowBurn(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SET_ALLOW_BURN,
            false
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
        });

        const allowBurn = await SC_System.gameManager.getAllowBurn();
        expect(allowBurn).toBe(false);
    });

    it('Test RequestBurn fails when allow_burn is false', async () => {
        const anyUser = await SC_System.blockchain.treasury('anyUser');
        const burnAmount = toNano('100');

        // Send RequestBurn with enough TON for gas + wallet processing
        // The contract will reserve storage tax and send remaining to wallet
        SC_System.messageResult = await SC_System.gameManager.sendRequestBurn(
            anyUser.getSender(),
            GAS_COST_REQUEST_BURN + toNano('0.15'), // Extra TON for wallet to process burn
            burnAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: anyUser.address,
            to: SC_System.gameManager.address,
            success: false,
            exitCode: 927, // ERR_BURN_NOT_ALLOWED
        });
    });

    it('Test RequestBurn succeeds when allow_burn is true and sends AskToBurn to jetton wallet', async () => {
        // First enable burn
        await SC_System.gameManager.sendSetAllowBurn(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SET_ALLOW_BURN,
            true
        );

        // Initialize the jetton wallet by minting jettons
        // Minter requires admin (GameManager) to mint, so we use redirectMessage
        const mintAmount = toNano('1000');
        const forwardAmount = toNano('0.1');
        const redirectMessage = JettonMinter.mintMessage(
            SC_System.jettonMinter.address,
            SC_System.gameManager.address,
            mintAmount,
            toNano('0.1'),
            toNano('0.2')
        );
        
        const mintResult = await SC_System.gameManager.sendRedirectMessage(
            SC_System.ownerAccount.getSender(),
            GAS_COST_REDIRECT_MESSAGE + forwardAmount,
            SC_System.jettonMinter.address,
            redirectMessage,
            forwardAmount
        );

        // Verify mint transaction succeeded
        expect(mintResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: SC_System.jettonMinter.address,
            success: true,
        });

        // Get GameManager's jetton wallet address from minter (after minting, wallet is initialized)
        const gameManagerWalletAddress = await SC_System.jettonMinter.getWalletAddress(SC_System.gameManager.address);
        const gameManagerWallet = SC_System.blockchain.openContract(
            JettonWallet.createFromAddress(gameManagerWalletAddress)
        );

        // Verify wallet is initialized and has balance
        const walletBalance = await gameManagerWallet.getJettonBalance();
        expect(walletBalance).toBeGreaterThanOrEqual(mintAmount);

        // Send TON to wallet for gas (needed to process burn and send notification to minter)
        await SC_System.ownerAccount.send({
            to: gameManagerWalletAddress,
            value: toNano('0.3'),
            body: beginCell().endCell(),
        });

        const anyUser = await SC_System.blockchain.treasury('anyUser');
        const burnAmount = toNano('100');

        // Send RequestBurn with enough TON for gas + wallet processing
        // The contract will reserve storage tax (0.01) and send remaining to wallet via CARRY_ALL_REMAINING_BALANCE
        // Wallet needs TON to: pay storage, send BurnNotificationForMinter to minter
        SC_System.messageResult = await SC_System.gameManager.sendRequestBurn(
            anyUser.getSender(),
            GAS_COST_REQUEST_BURN + toNano('0.3'), // Extra TON for wallet to process burn (after reserveValue)
            burnAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: anyUser.address,
            to: SC_System.gameManager.address,
            success: true,
        });


        // Verify AskToBurn message was sent to GameManager's jetton wallet
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: gameManagerWalletAddress,
            success: true,
            body: (body) => {
                if (!body) return false;
                const slice = body.beginParse();
                const opcode = slice.loadUint(32);
                return opcode === Opcodes.OP_ASK_TO_BURN;
            },
        });
    });

    it('Test RequestBurn with custom payload and sendExcessesTo', async () => {
        // First enable burn
        await SC_System.gameManager.sendSetAllowBurn(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SET_ALLOW_BURN,
            true
        );

        // Initialize the jetton wallet by minting jettons
        // Minter requires admin (GameManager) to mint, so we use redirectMessage
        const mintAmount = toNano('1000');
        const forwardAmount = toNano('0.1');
        const redirectMessage = JettonMinter.mintMessage(
            SC_System.jettonMinter.address,
            SC_System.gameManager.address,
            mintAmount,
            toNano('0.1'),
            toNano('0.2')
        );
        
        const mintResult = await SC_System.gameManager.sendRedirectMessage(
            SC_System.ownerAccount.getSender(),
            GAS_COST_REDIRECT_MESSAGE + forwardAmount,
            SC_System.jettonMinter.address,
            redirectMessage,
            forwardAmount
        );

        // Verify mint transaction succeeded
        expect(mintResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: SC_System.jettonMinter.address,
            success: true,
        });

        // Get GameManager's jetton wallet address from minter (after minting, wallet is initialized)
        const gameManagerWalletAddress = await SC_System.jettonMinter.getWalletAddress(SC_System.gameManager.address);
        const gameManagerWallet = SC_System.blockchain.openContract(
            JettonWallet.createFromAddress(gameManagerWalletAddress)
        );

        // Verify wallet is initialized and has balance
        const walletBalance = await gameManagerWallet.getJettonBalance();
        expect(walletBalance).toBeGreaterThanOrEqual(mintAmount);

        // Send TON to wallet for gas (needed to process burn)
        await SC_System.ownerAccount.send({
            to: gameManagerWalletAddress,
            value: toNano('0.2'),
            body: beginCell().endCell(),
        });

        const anyUser = await SC_System.blockchain.treasury('anyUser');
        const excessesRecipient = await SC_System.blockchain.treasury('excessesRecipient');
        const burnAmount = toNano('100');
        const customPayload = beginCell()
            .storeUint(0x12345678, 32)
            .endCell();

        // Send RequestBurn with enough TON for gas + wallet processing
        // The contract will reserve storage tax (0.01) and send remaining to wallet via CARRY_ALL_REMAINING_BALANCE
        // Wallet needs TON to: pay storage, send BurnNotificationForMinter to minter
        SC_System.messageResult = await SC_System.gameManager.sendRequestBurn(
            anyUser.getSender(),
            GAS_COST_REQUEST_BURN + toNano('0.3'), // Extra TON for wallet to process burn (after reserveValue)
            burnAmount,
            excessesRecipient.address,
            customPayload
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: anyUser.address,
            to: SC_System.gameManager.address,
            success: true,
        });

        // Verify AskToBurn message was sent with correct parameters
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: gameManagerWalletAddress,
            success: true,
            body: (body) => {
                if (!body) return false;
                const slice = body.beginParse();
                const opcode = slice.loadUint(32);
                if (opcode !== Opcodes.OP_ASK_TO_BURN) return false;
                const queryId = slice.loadUint(64);
                const jettonAmount = slice.loadCoins();
                // Parse Maybe address (MsgAddress format: loadAddress handles the 2-bit flag automatically)
                const sendExcessesTo = slice.loadAddress();
                if (!sendExcessesTo) return false; // Should be present
                // Parse Maybe cell (1 bit flag + ref if present)
                const hasCustomPayload = slice.loadBit();
                if (!hasCustomPayload) return false;
                const customPayload = slice.loadRef();
                return jettonAmount === burnAmount && 
                       sendExcessesTo.equals(excessesRecipient.address);
            },
        });
    });

    it('Test RequestBurn fails with insufficient gas', async () => {
        // First enable burn
        await SC_System.gameManager.sendSetAllowBurn(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SET_ALLOW_BURN,
            true
        );

        const anyUser = await SC_System.blockchain.treasury('anyUser');
        const burnAmount = toNano('100');
        const insufficientGas = toNano('0.001'); // Less than GAS_COST_REQUEST_BURN

        SC_System.messageResult = await SC_System.gameManager.sendRequestBurn(
            anyUser.getSender(),
            insufficientGas,
            burnAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: anyUser.address,
            to: SC_System.gameManager.address,
            success: false,
            exitCode: 904, // ERR_MESSAGE_VALUE_TOO_LOW
        });
    });
});

