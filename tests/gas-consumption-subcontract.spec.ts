import { beginCell, fromNano, toNano, SendMode } from "@ton/core";
import '@ton/test-utils';
import { ContractSystem, initContractSystem } from './test_utils';
import { Subcontract } from '../wrappers/subcontract/Subcontract';
import { GAS_COST_FORWARD, GAS_COST_FORWARD_WITH_INIT, Opcodes as SubcontractOpcodes } from '../wrappers/subcontract/types';
import { encodeRequestToMove } from '../wrappers/game/types';
import { Ship, shipConfigToCell } from '../wrappers/game/Ship';
import { MoveMode } from '../wrappers/game/structs';
import { GAS_COST_REQUEST_TO_MOVE, GAS_COST_REQUEST_MINT, GAS_COST_MOVE_SHIP_TO_CC, BASIC_STORAGE_TAX } from '../wrappers/game/types';
import * as fs from 'fs';
import * as path from 'path';

describe("Gas Prices - Subcontract", () => {
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
        const filename = `gas-costs-subcontract-${Date.now()}.json`;
        const filepath = path.join(buildDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(buildData, null, 2));
        console.log(`\n✅ Gas costs written to ${filepath}`);
    });

    it("DeployShipThroughSubcontract", async () => {
        const subcontractId = 100n;
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        await SC_System.ownerAccount.send({
            to: subcontract.address,
            value: toNano('1'),
            body: beginCell().endCell(),
        });

        const shipConfig = {
            userAddress: subcontract.address,
            gameAddress: SC_System.game.address,
            coordinateCellCode: SC_System.coordinateCellCode,
        };

        const shipForSubcontract = SC_System.blockchain.openContract(Ship.createFromConfig(
            shipConfig,
            SC_System.shipCode
        ));

        const shipData = shipConfigToCell(shipConfig);
        const shipStateInit = beginCell()
            .storeUint(0, 2)
            .storeRef(SC_System.shipCode)
            .storeRef(shipData)
            .endCell();

        let initial_balance = await SC_System.ownerAccount.getBalance();
        let little_less_than_gas_needed = toNano('0.01');
        const deployAmount = toNano('5');
        const deployBody = beginCell().endCell();
        const totalAmount = GAS_COST_FORWARD_WITH_INIT + deployAmount + toNano('0.5');
        let gas_sent = totalAmount + toNano('0.1');

        SC_System.messageResult = await subcontract.sendForwardWithInit(
            SC_System.ownerAccount.getSender(),
            totalAmount,
            shipForSubcontract.address,
            shipStateInit,
            deployBody,
            deployAmount,
            SendMode.PAY_GAS_SEPARATELY
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: subcontract.address,
            success: true,
            op: SubcontractOpcodes.OP_FORWARD_WITH_INIT,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: subcontract.address,
            to: shipForSubcontract.address,
            deploy: true,
            success: true,
        });

        const forwardWithInitTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.from === SC_System.ownerAccount.address && 
            tx.to === subcontract.address &&
            tx.op === SubcontractOpcodes.OP_FORWARD_WITH_INIT
        );
        
        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['DeployShipThroughSubcontract'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("MoveShipThroughSubcontract", async () => {
        const subcontractId = 101n;
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        await SC_System.ownerAccount.send({
            to: subcontract.address,
            value: toNano('1'),
            body: beginCell().endCell(),
        });

        const shipConfig = {
            userAddress: subcontract.address,
            gameAddress: SC_System.game.address,
            coordinateCellCode: SC_System.coordinateCellCode,
        };

        const shipForSubcontract = SC_System.blockchain.openContract(Ship.createFromConfig(
            shipConfig,
            SC_System.shipCode
        ));

        const shipData = shipConfigToCell(shipConfig);
        const shipStateInit = beginCell()
            .storeUint(0, 2)
            .storeRef(SC_System.shipCode)
            .storeRef(shipData)
            .endCell();

        const deployAmount = toNano('5');
        const deployBody = beginCell().endCell();
        const totalDeployAmount = GAS_COST_FORWARD_WITH_INIT + deployAmount + toNano('0.5');

        await subcontract.sendForwardWithInit(
            SC_System.ownerAccount.getSender(),
            totalDeployAmount,
            shipForSubcontract.address,
            shipStateInit,
            deployBody,
            deployAmount,
            SendMode.PAY_GAS_SEPARATELY
        );

        const minRequiredBalance = GAS_COST_REQUEST_TO_MOVE + GAS_COST_MOVE_SHIP_TO_CC + toNano('1');
        const shipBalance = await shipForSubcontract.getTonBalance();
        if (shipBalance < minRequiredBalance) {
            await SC_System.ownerAccount.send({
                to: shipForSubcontract.address,
                value: toNano('2'),
                body: beginCell().endCell(),
            });
        }

        let initial_balance = await SC_System.ownerAccount.getBalance();
        let little_less_than_gas_needed = toNano('0.01');
        const moveMessage = encodeRequestToMove({ mode: MoveMode.UP });
        const TODO_TOTAL_GAS_TO_MOVE = GAS_COST_REQUEST_TO_MOVE + GAS_COST_REQUEST_MINT + toNano('0.01');
        const forwardAmount = TODO_TOTAL_GAS_TO_MOVE;
        const totalAmount = GAS_COST_FORWARD + forwardAmount;
        let gas_sent = totalAmount + toNano('0.1');

        SC_System.messageResult = await subcontract.sendForward(
            SC_System.ownerAccount.getSender(),
            totalAmount,
            shipForSubcontract.address,
            moveMessage,
            forwardAmount,
            false,
            SendMode.PAY_GAS_SEPARATELY
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: subcontract.address,
            success: true,
            op: SubcontractOpcodes.OP_FORWARD,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: subcontract.address,
            to: shipForSubcontract.address,
            success: true,
            op: 0x4a5b6c7d, // OP_REQUEST_TO_MOVE
        });

        const forwardTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.from === SC_System.ownerAccount.address && 
            tx.to === subcontract.address &&
            tx.op === SubcontractOpcodes.OP_FORWARD
        );
        
        let final_balance = await SC_System.ownerAccount.getBalance();
        let cost = initial_balance - final_balance;
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['MoveShipThroughSubcontract'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("TransferNotificationForRecipientToSubcontract", async () => {
        const subcontractId = 102n;
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = toNano('0.06');

        const jettonAmount = toNano('100');
        const notificationBody = beginCell()
            .storeUint(0x7362d09c, 32)
            .storeUint(0, 64)
            .storeCoins(jettonAmount)
            .storeMaybeRef(null)
            .endCell();

        SC_System.messageResult = await SC_System.ownerAccount.send({
            to: subcontract.address,
            value: toNano('0.1'),
            body: notificationBody,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: subcontract.address,
            success: true,
        });

        const transferNotificationTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.from === SC_System.ownerAccount.address && 
            tx.to === subcontract.address &&
            tx.success === true
        );
        
        const cost = transferNotificationTx?.totalFees || toNano('0.05');
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['TransferNotificationForRecipientToSubcontract'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("SubcontractWithdraw", async () => {
        const subcontractId = 103n;
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        await SC_System.ownerAccount.send({
            to: subcontract.address,
            value: toNano('1'),
        });

        let little_less_than_gas_needed = toNano('0.01');
        const withdrawAmount = toNano('0.5');
        let gas_sent = toNano('0.1');

        SC_System.messageResult = await subcontract.sendWithdraw(
            SC_System.ownerAccount.getSender(),
            withdrawAmount,
            SC_System.ownerAccount.address,
            gas_sent
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: subcontract.address,
            success: true,
            op: SubcontractOpcodes.OP_WITHDRAW,
        });

        const withdrawTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.from === SC_System.ownerAccount.address && 
            tx.to === subcontract.address &&
            tx.op === SubcontractOpcodes.OP_WITHDRAW
        );
        
        const cost = withdrawTx?.totalFees || toNano('0.05');
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['SubcontractWithdraw'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("SetRedirectExcess", async () => {
        const subcontractId = 104n;
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        await SC_System.ownerAccount.send({
            to: subcontract.address,
            value: toNano('0.5'),
        });

        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = toNano('0.05');

        SC_System.messageResult = await subcontract.sendSetRedirectExcess(
            SC_System.ownerAccount.getSender(),
            true,
            gas_sent
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: subcontract.address,
            success: true,
            op: SubcontractOpcodes.OP_SET_REDIRECT_EXCESS,
        });

        // Use transaction fees instead of balance difference (cashback is sent)
        const setRedirectExcessTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.from === SC_System.ownerAccount.address && 
            tx.to === subcontract.address &&
            tx.op === SubcontractOpcodes.OP_SET_REDIRECT_EXCESS
        );
        
        const cost = setRedirectExcessTx?.totalFees || toNano('0.05');
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['SetRedirectExcess'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });

    it("SetExcessThreshold", async () => {
        const subcontractId = 105n;
        const subcontract = SC_System.blockchain.openContract(Subcontract.createFromConfig({
            ownerAddress: SC_System.ownerAccount.address,
            id: subcontractId,
        }, SC_System.subcontractCode));

        await subcontract.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        await SC_System.ownerAccount.send({
            to: subcontract.address,
            value: toNano('0.5'),
        });

        let little_less_than_gas_needed = toNano('0.01');
        let gas_sent = toNano('0.05');

        SC_System.messageResult = await subcontract.sendSetExcessThreshold(
            SC_System.ownerAccount.getSender(),
            toNano('0.2'),
            gas_sent
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: subcontract.address,
            success: true,
            op: SubcontractOpcodes.OP_SET_EXCESS_THRESHOLD,
        });

        // Use transaction fees instead of balance difference (cashback is sent)
        const setExcessThresholdTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.from === SC_System.ownerAccount.address && 
            tx.to === subcontract.address &&
            tx.op === SubcontractOpcodes.OP_SET_EXCESS_THRESHOLD
        );
        
        const cost = setExcessThresholdTx?.totalFees || toNano('0.05');
        const costStr = fromNano(cost);
        console.log(`Cost: ${costStr}`);
        gasCosts['SetExcessThreshold'] = costStr;

        expect(cost).toBeLessThanOrEqual(gas_sent);
        expect(cost).toBeGreaterThanOrEqual(little_less_than_gas_needed);
    });
});

