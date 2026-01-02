import { beginCell, fromNano, toNano } from "@ton/core";
import '@ton/test-utils';
import { ContractSystem, initContractSystem, cleanupContractSystem } from '../test_utils';
import { Opcodes as GameManagerOpcodes, GAS_COST_SET_JETTON_MINTER_ADDRESS, GAS_COST_SET_GAMES, GAS_COST_REDIRECT_MESSAGE, GAS_COST_SET_ALLOW_BURN, GAS_COST_REQUEST_BURN } from '../../wrappers/game_manager/types';
import { JettonMinter } from '../../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../../wrappers/jetton/JettonWallet';
import { jettonContentToCell } from '../../wrappers/jetton/JettonMinter';
import * as fs from 'fs';
import * as path from 'path';

describe("Gas Prices - GameManager", () => {
    let SC_System: ContractSystem;
    let gasCosts: Record<string, string> = {};

    beforeEach(async () => {
        SC_System = await initContractSystem();
    }, 100000);

    afterEach(() => {
        cleanupContractSystem(SC_System);
        SC_System = null as any;
    });

    afterAll(() => {
        const timestamp = new Date().toISOString();
        const buildData = { timestamp, gasCosts };
        const buildDir = path.join(process.cwd(), 'build');
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir, { recursive: true });
        }
        const filename = `gas-costs-game-manager-${Date.now()}.json`;
        const filepath = path.join(buildDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(buildData, null, 2));
        console.log(`\n✅ Gas costs written to ${filepath}`);
        // Clear gasCosts to free memory
        Object.keys(gasCosts).forEach(key => delete gasCosts[key]);
    });

    it("SetJettonMinterAddress", async () => {
        let initial_balance = await SC_System.ownerAccount.getBalance();
        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = GAS_COST_SET_JETTON_MINTER_ADDRESS;

        SC_System.messageResult = await SC_System.gameManager.sendSetJettonMinterAddress(
            SC_System.ownerAccount.getSender(),
            gas_sent,
            SC_System.jettonMinter.address,
            SC_System.jettonWalletCode
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
            op: GameManagerOpcodes.OP_SET_JETTON_MINTER_ADDRESS,
        });

        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['SetJettonMinterAddress'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("SetGames", async () => {
        let initial_balance = await SC_System.ownerAccount.getBalance();
        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = GAS_COST_SET_GAMES;

        SC_System.messageResult = await SC_System.gameManager.sendSetGames(
            SC_System.ownerAccount.getSender(),
            gas_sent,
            beginCell().storeAddress(SC_System.game.address).endCell()
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
            op: GameManagerOpcodes.OP_SET_GAMES,
        });

        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['SetGames'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("RedirectMessage", async () => {
        const mintAmount = toNano('1000');
        const redirectMessage = JettonMinter.mintMessage(
            SC_System.jettonMinter.address,
            SC_System.ownerAccount.address,
            mintAmount,
            toNano('0.1'),
            toNano('0.2')
        );

        let initial_balance = await SC_System.ownerAccount.getBalance();
        let little_less_than_gas_needed = toNano('0.001');
        const forwardAmount = toNano('0.1');
        let gas_sent = GAS_COST_REDIRECT_MESSAGE + forwardAmount;

        SC_System.messageResult = await SC_System.gameManager.sendRedirectMessage(
            SC_System.ownerAccount.getSender(),
            gas_sent,
            SC_System.jettonMinter.address,
            redirectMessage,
            forwardAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
            op: GameManagerOpcodes.OP_REDIRECT_MESSAGE,
        });

        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['RedirectMessage'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("Transfer (JettonWallet)", async () => {
        const userBalance = await SC_System.ownerJettonWallet.getJettonBalance();
        expect(userBalance).toBeGreaterThan(0n);

        const gameManagerJettonWalletAddress = await SC_System.jettonMinter.getWalletAddress(SC_System.gameManager.address);
        let initial_balance = await SC_System.ownerAccount.getBalance();
        let little_less_than_gas_needed = toNano('0.1');
        let gas_sent = toNano('0.2');

        const transferAmount = toNano('100');
        const forwardPayload = beginCell()
            .storeAddress(SC_System.ownerShip.address)
            .endCell();

        SC_System.messageResult = await SC_System.ownerJettonWallet.sendTransfer(
            SC_System.ownerAccount.getSender(),
            gas_sent,
            transferAmount,
            SC_System.gameManager.address,
            SC_System.ownerAccount.address,
            beginCell().endCell(),
            toNano('0.1'),
            forwardPayload
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerJettonWallet.address,
            success: true,
        });

        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['Transfer'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("SetAllowBurn", async () => {
        let initial_balance = await SC_System.ownerAccount.getBalance();
        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = GAS_COST_SET_ALLOW_BURN;

        SC_System.messageResult = await SC_System.gameManager.sendSetAllowBurn(
            SC_System.ownerAccount.getSender(),
            gas_sent,
            true
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
            op: GameManagerOpcodes.OP_SET_ALLOW_BURN,
        });

        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['SetAllowBurn'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("RequestBurn", async () => {
        // First enable burn
        await SC_System.gameManager.sendSetAllowBurn(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SET_ALLOW_BURN,
            true
        );

        // Initialize GameManager's jetton wallet by minting jettons
        const mintAmount = toNano('1000');
        const forwardAmount = toNano('0.1');
        const redirectMessage = JettonMinter.mintMessage(
            SC_System.jettonMinter.address,
            SC_System.gameManager.address,
            mintAmount,
            toNano('0.1'),
            toNano('0.2')
        );
        
        await SC_System.gameManager.sendRedirectMessage(
            SC_System.ownerAccount.getSender(),
            GAS_COST_REDIRECT_MESSAGE + forwardAmount,
            SC_System.jettonMinter.address,
            redirectMessage,
            forwardAmount
        );

        // Get GameManager's jetton wallet address
        const gameManagerWalletAddress = await SC_System.jettonMinter.getWalletAddress(SC_System.gameManager.address);
        const gameManagerWallet = SC_System.blockchain.openContract(
            JettonWallet.createFromAddress(gameManagerWalletAddress)
        );

        // Verify wallet has balance
        const walletBalance = await gameManagerWallet.getJettonBalance();
        expect(walletBalance).toBeGreaterThanOrEqual(mintAmount);

        // Send TON to wallet for gas (needed to process burn and send notification to minter)
        await SC_System.ownerAccount.send({
            to: gameManagerWalletAddress,
            value: toNano('0.3'),
            body: beginCell().endCell(),
        });

        // Test RequestBurn
        const anyUser = await SC_System.blockchain.treasury('anyUser');
        const burnAmount = toNano('100');
        let initial_balance = await anyUser.getBalance();
        let little_less_than_gas_needed = toNano('0.01');
        // Send RequestBurn with enough TON for gas + wallet processing
        // Need extra buffer for wallet to process burn and send notification to minter
        // Actual cost includes gas_sent + ~0.002 TON in additional fees (message forwarding, etc.)
        // We set a safe limit that accounts for the full flow including wallet operations
        // The cost will be gas_sent + additional fees, so we add a buffer to gas_sent
        let gas_sent = GAS_COST_REQUEST_BURN + toNano('0.52') + toNano('0.005');

        SC_System.messageResult = await SC_System.gameManager.sendRequestBurn(
            anyUser.getSender(),
            gas_sent,
            burnAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: anyUser.address,
            to: SC_System.gameManager.address,
            success: true,
            op: GameManagerOpcodes.OP_REQUEST_BURN,
        });

        // Verify AskToBurn message was sent to wallet
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: gameManagerWalletAddress,
            success: true,
            op: GameManagerOpcodes.OP_ASK_TO_BURN,
        });

        let final_balance = await anyUser.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['RequestBurn'] = costStr;

        // Cost includes gas_sent + additional fees (~0.002 TON for message forwarding, etc.)
        // So we allow a small buffer for these additional fees
        const additionalFeesBuffer = toNano('0.003');
        expect(cost).toBeLessThanOrEqual(gas_sent + additionalFeesBuffer);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });
});

