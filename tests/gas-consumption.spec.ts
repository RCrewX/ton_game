import { beginCell, fromNano, toNano } from "@ton/core";
import '@ton/test-utils';
import { ContractSystem, initContractSystem, setupCoordinateCellWithFirstExplorer } from './test_utils';
import { MoveMode } from '../wrappers/game/structs';
import { Opcodes, GAS_COST_REQUEST_SHIP_ADDRESS, GAS_COST_REQUEST_COORDINATE_CELL_ADDRESS, GAS_COST_REQUEST_TO_MOVE } from '../wrappers/game/types';
import { Opcodes as GameManagerOpcodes, GAS_COST_SET_JETTON_MINTER_ADDRESS, GAS_COST_SET_GAMES, GAS_COST_REDIRECT_MESSAGE } from '../wrappers/game_manager/types';
import { JettonMinter } from '../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../wrappers/jetton/JettonWallet';
import { jettonContentToCell } from '../wrappers/jetton/JettonMinter';
import { CoordinateCell } from '../wrappers/game/CoordinateCell';
import { SandboxContract, TreasuryContract } from '@ton/sandbox';
import * as fs from 'fs';
import * as path from 'path';

describe("Gas Prices", () => {
    let SC_System: ContractSystem;
    let recipient: SandboxContract<TreasuryContract>;
    let gasCosts: Record<string, string> = {};

    beforeEach(async () => {
        // Create Sandbox and deploy contracts
        SC_System = await initContractSystem();
        recipient = await SC_System.blockchain.treasury('recipient');
    }, 100000);

    afterAll(() => {
        // Generate build file with gas costs and timestamp
        const timestamp = new Date().toISOString();
        const buildData = {
            timestamp,
            gasCosts
        };
        
        const buildDir = path.join(process.cwd(), 'build');
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir, { recursive: true });
        }
        
        const filename = `gas-costs-${Date.now()}.json`;
        const filepath = path.join(buildDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(buildData, null, 2));
        console.log(`\n✅ Gas costs written to ${filepath}`);
    });

    it("RequestToMove", async () => {
        let initial_balance = await SC_System.ownerAccount.getBalance();

        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = GAS_COST_REQUEST_TO_MOVE;

        SC_System.messageResult = await SC_System.ownerShip.sendMove(
            SC_System.ownerAccount.getSender(),
            gas_sent,
            MoveMode.UP
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_MOVE,
        });

        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['RequestToMove'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("RequestShipAddress", async () => {
        let initial_balance = await SC_System.ownerAccount.getBalance();

        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = GAS_COST_REQUEST_SHIP_ADDRESS;

        SC_System.messageResult = await SC_System.game.sendRequestShipAddress(
            SC_System.ownerAccount.getSender(),
            gas_sent,
            SC_System.ownerAccount.address
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.game.address,
            success: true,
            op: Opcodes.OP_REQUEST_SHIP_ADDRESS,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.game.address,
            to: SC_System.ownerAccount.address,
            success: true,
            op: Opcodes.OP_RESPONSE_ADDRESS,
        });

        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['RequestShipAddress'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("RequestCoordinateCellAddress", async () => {
        let initial_balance = await SC_System.ownerAccount.getBalance();

        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = GAS_COST_REQUEST_COORDINATE_CELL_ADDRESS;

        SC_System.messageResult = await SC_System.game.sendRequestCoordinateCellAddress(
            SC_System.ownerAccount.getSender(),
            gas_sent,
            { x: 5n, y: 10n }
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.game.address,
            success: true,
            op: Opcodes.OP_REQUEST_COORDINATE_CELL_ADDRESS,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.game.address,
            to: SC_System.ownerAccount.address,
            success: true,
            op: Opcodes.OP_RESPONSE_ADDRESS,
        });

        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['RequestCoordinateCellAddress'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("WithdrawTON", async () => {
        // Setup: Create coordinate cell and send TON to it
        const coordinateCell = await setupCoordinateCellWithFirstExplorer(SC_System, { x: 0n, y: 1n });
        const sendAmount = toNano('1');
        await SC_System.ownerAccount.send({
            to: coordinateCell.address,
            value: sendAmount,
            body: beginCell().endCell(),
        });

        let initial_balance = await SC_System.ownerAccount.getBalance();

        let little_less_than_gas_needed = toNano('0.05');
        let gas_sent = toNano('0.1');

        const withdrawAmount = toNano('0.5');
        SC_System.messageResult = await coordinateCell.sendWithdrawTON(
            SC_System.ownerAccount.getSender(),
            gas_sent,
            recipient.address,
            withdrawAmount
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: coordinateCell.address,
            success: true,
            op: Opcodes.OP_WITHDRAW_TON,
        });

        // Calculate cost from transaction fees
        let final_balance = await SC_System.ownerAccount.getBalance();
        
        // Find the main transaction from owner to coordinate cell and get its fees
        const mainTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.from === SC_System.ownerAccount.address && 
            tx.to === coordinateCell.address &&
            tx.op === Opcodes.OP_WITHDRAW_TON
        );
        
        // Use transaction fees if available, otherwise use balance difference
        // The cost should be the actual fees, not the entire gas_sent amount
        const cost = mainTx?.totalFees ? mainTx.totalFees : (initial_balance - final_balance);
        
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['WithdrawTON'] = costStr;

        // Cost should be less than or equal to gas_sent (with some tolerance for fees)
        expect(cost).toBeLessThanOrEqual(gas_sent + toNano('0.01'));
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("WithdrawJetton", async () => {
        // Setup: Create coordinate cell and mint jettons to it
        const coordinateCell = await setupCoordinateCellWithFirstExplorer(SC_System, { x: 0n, y: 1n });
        
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

        const coordinateCellJettonWalletAddress = await jettonMinter.getWalletAddress(coordinateCell.address);

        let initial_balance = await SC_System.ownerAccount.getBalance();

        let little_less_than_gas_needed = toNano('0.1');
        let gas_sent = toNano('0.2');

        const withdrawAmount = toNano('100');
        SC_System.messageResult = await coordinateCell.sendWithdrawJetton(
            SC_System.ownerAccount.getSender(),
            gas_sent,
            coordinateCellJettonWalletAddress,
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

        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['WithdrawJetton'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("Transfer (JettonWallet)", async () => {
        // Setup: Ensure user has jettons
        const userBalance = await SC_System.ownerJettonWallet.getJettonBalance();
        expect(userBalance).toBeGreaterThan(0n);

        // Get GameManager's jetton wallet address
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
            beginCell().endCell(), // customPayload
            toNano('0.1'), // forwardAmount
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
        // Setup: Create a mint message to redirect
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
        // Need to send gas cost + forward amount for redirect message
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
});

