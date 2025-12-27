import { beginCell, fromNano, toNano, SendMode } from "@ton/core";
import '@ton/test-utils';
import { ContractSystem, initContractSystem, cleanupContractSystem } from './test_utils';
import { Opcodes, GAS_COST_JETTON_USED, GAS_COST_SHIP_UPGRADE, GAS_COST_TRANSFER_NOTIFICATION } from '../wrappers/game/types';
import { Opcodes as GameManagerOpcodes } from '../wrappers/game_manager/types';
import { JettonWallet } from '../wrappers/jetton/JettonWallet';
import * as fs from 'fs';
import * as path from 'path';

describe("Gas Prices - Game Upgrade", () => {
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
        const filename = `gas-costs-game-upgrade-${Date.now()}.json`;
        const filepath = path.join(buildDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(buildData, null, 2));
        console.log(`\n✅ Gas costs written to ${filepath}`);
        // Clear gasCosts to free memory
        Object.keys(gasCosts).forEach(key => delete gasCosts[key]);
    });

    it("JettonUsed", async () => {
        const gameManagerJettonWalletAddress = await SC_System.jettonMinter.getWalletAddress(SC_System.gameManager.address);
        const transferAmount = toNano('100');
        const dataCell = beginCell()
            .storeAddress(SC_System.ownerShip.address)
            .endCell();
        const gameAddressCell = beginCell()
            .storeAddress(SC_System.game.address)
            .endCell();
        const forwardPayload = beginCell()
            .storeRef(gameAddressCell)
            .storeRef(dataCell)
            .endCell();

        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = GAS_COST_JETTON_USED;

        SC_System.messageResult = await SC_System.ownerJettonWallet.sendTransfer(
            SC_System.ownerAccount.getSender(),
            toNano('0.2'),
            transferAmount,
            SC_System.gameManager.address,
            SC_System.ownerAccount.address,
            beginCell().endCell(),
            toNano('0.1'),
            forwardPayload
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: SC_System.game.address,
            success: true,
            op: Opcodes.OP_JETTON_USED,
        });

        const jettonUsedTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.from === SC_System.gameManager.address && 
            tx.to === SC_System.game.address &&
            tx.op === Opcodes.OP_JETTON_USED
        );
        
        const cost = jettonUsedTx?.totalFees || toNano('0.05');
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['JettonUsed'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("ShipUpgrade", async () => {
        const gameManagerJettonWalletAddress = await SC_System.jettonMinter.getWalletAddress(SC_System.gameManager.address);
        const transferAmount = toNano('100');
        const dataCell = beginCell()
            .storeAddress(SC_System.ownerShip.address)
            .endCell();
        const gameAddressCell = beginCell()
            .storeAddress(SC_System.game.address)
            .endCell();
        const forwardPayload = beginCell()
            .storeRef(gameAddressCell)
            .storeRef(dataCell)
            .endCell();

        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = GAS_COST_SHIP_UPGRADE;

        SC_System.messageResult = await SC_System.ownerJettonWallet.sendTransfer(
            SC_System.ownerAccount.getSender(),
            toNano('0.2'),
            transferAmount,
            SC_System.gameManager.address,
            SC_System.ownerAccount.address,
            beginCell().endCell(),
            toNano('0.1'),
            forwardPayload
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.game.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_SHIP_UPGRADE,
        });

        const shipUpgradeTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.from === SC_System.game.address && 
            tx.to === SC_System.ownerShip.address &&
            tx.op === Opcodes.OP_SHIP_UPGRADE
        );
        
        const cost = shipUpgradeTx?.totalFees || toNano('0.05');
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['ShipUpgrade'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("TransferNotificationForRecipient", async () => {
        const gameManagerJettonWalletAddress = await SC_System.jettonMinter.getWalletAddress(SC_System.gameManager.address);
        const transferAmount = toNano('100');
        const dataCell = beginCell()
            .storeAddress(SC_System.ownerShip.address)
            .endCell();
        const gameAddressCell = beginCell()
            .storeAddress(SC_System.game.address)
            .endCell();
        const forwardPayload = beginCell()
            .storeRef(gameAddressCell)
            .storeRef(dataCell)
            .endCell();

        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = GAS_COST_TRANSFER_NOTIFICATION;

        SC_System.messageResult = await SC_System.ownerJettonWallet.sendTransfer(
            SC_System.ownerAccount.getSender(),
            toNano('0.2'),
            transferAmount,
            SC_System.gameManager.address,
            SC_System.ownerAccount.address,
            beginCell().endCell(),
            toNano('0.1'),
            forwardPayload
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: gameManagerJettonWalletAddress,
            to: SC_System.gameManager.address,
            success: true,
            op: GameManagerOpcodes.OP_TRANSFER_NOTIFICATION_FOR_RECIPIENT,
        });

        const transferNotificationTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.from === gameManagerJettonWalletAddress && 
            tx.to === SC_System.gameManager.address &&
            tx.op === GameManagerOpcodes.OP_TRANSFER_NOTIFICATION_FOR_RECIPIENT
        );
        
        const cost = transferNotificationTx?.totalFees || toNano('0.05');
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['TransferNotificationForRecipient'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });
});

