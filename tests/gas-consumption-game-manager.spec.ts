import { beginCell, fromNano, toNano } from "@ton/core";
import '@ton/test-utils';
import { ContractSystem, initContractSystem } from './test_utils';
import { Opcodes as GameManagerOpcodes, GAS_COST_SET_JETTON_MINTER_ADDRESS, GAS_COST_SET_GAMES, GAS_COST_REDIRECT_MESSAGE } from '../wrappers/game_manager/types';
import { JettonMinter } from '../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../wrappers/jetton/JettonWallet';
import { jettonContentToCell } from '../wrappers/jetton/JettonMinter';
import * as fs from 'fs';
import * as path from 'path';

describe("Gas Prices - GameManager", () => {
    let SC_System: ContractSystem;
    let gasCosts: Record<string, string> = {};

    beforeEach(async () => {
        SC_System = await initContractSystem();
    }, 100000);

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
});

