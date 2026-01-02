import { beginCell, toNano } from '@ton/core';
import '@ton/test-utils';
import { ContractSystem, initContractSystem, cleanupContractSystem, buildJettonUsageForwardPayload } from '../test_utils';
import { CoordinateCell } from '../../wrappers/game/CoordinateCell';
import { Opcodes, GAS_COST_SEND_MOVE, JettonUsageMode } from '../../wrappers/game/types';
import { MoveMode } from '../../wrappers/game/structs';

describe('Fast Travel', () => {
    let SC_System: ContractSystem;

    beforeEach(async () => {
        SC_System = await initContractSystem();
    }, 100000);

    afterEach(() => {
        cleanupContractSystem(SC_System);
        SC_System = null as any;
    });

    it('allows funding fast travel and travelling from origin', async () => {
        const forwardPayload = buildJettonUsageForwardPayload(
            SC_System.game.address,
            SC_System.ownerShip.address,
            JettonUsageMode.FAST_TRAVEL_UPGRADE,
        );

        SC_System.messageResult = await SC_System.ownerJettonWallet.sendTransfer(
            SC_System.ownerAccount.getSender(),
            toNano('0.2'),
            toNano('50'),
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

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.game.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_FAST_TRAVEL_UPGRADE,
        });
        const targetXY = { x: 0n, y: 3n };

        // Open Cell before fast travel
        SC_System.messageResult = await SC_System.ownerShip.sendMove(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SEND_MOVE,
            MoveMode.UP
        );
        SC_System.messageResult = await SC_System.ownerShip.sendMove(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SEND_MOVE,
            MoveMode.UP
        );

        SC_System.messageResult = await SC_System.ownerShip.sendMove(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SEND_MOVE,
            MoveMode.UP
        );

        SC_System.messageResult = await SC_System.ownerShip.sendMove(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SEND_MOVE,
            MoveMode.EXIT
        );

        expect(await SC_System.ownerShip.getMovementInProcess()).toBe(false);
        
        const startCC = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({
            gameAddress: SC_System.game.address,
            xy: { x: 0n, y: 0n },
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        const targetCC = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({
            gameAddress: SC_System.game.address,
            xy: targetXY,
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        
        expect(await targetCC.getOpened()).toBe(true);
        SC_System.messageResult = await SC_System.ownerShip.sendFastTravel(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SEND_MOVE,
            targetXY
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_FAST_TRAVEL,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerShip.address,
            to: startCC.address,
            success: true,
            op: Opcodes.OP_TRAVEL_TO_CC,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: startCC.address,
            to: targetCC.address,
            success: true,
            op: Opcodes.OP_MOVE,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: targetCC.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_MOVE_END,
        });

        const movementInProcess = await SC_System.ownerShip.getMovementInProcess();
        expect(movementInProcess).toBe(false);

        const gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
    });

    it('fails fast travel when no enriched fuel available', async () => {
        const targetXY = { x: 0n, y: 11n };
        const ERR_FAST_TRAVEL_INFO_NOT_INITIALIZED = 923;
        const ERR_NOT_ENOUGH_FUEL_FOR_TRAVEL = 924;
        const ERR_FAST_TRAVEL_NOT_ALLOWED_TO_CLOSED_CELLS = 927;

        SC_System.messageResult = await SC_System.ownerShip.sendFastTravel(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SEND_MOVE,
            targetXY
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: false,
            op: Opcodes.OP_REQUEST_TO_FAST_TRAVEL,
            exitCode: ERR_FAST_TRAVEL_INFO_NOT_INITIALIZED,
        });

        // Send 10 jetton for enriched fuel
        const forwardPayload = buildJettonUsageForwardPayload(
            SC_System.game.address,
            SC_System.ownerShip.address,
            JettonUsageMode.FAST_TRAVEL_UPGRADE,
        );
        SC_System.messageResult = await SC_System.ownerJettonWallet.sendTransfer(
            SC_System.ownerAccount.getSender(),
            toNano('1'),
            10n,
            SC_System.gameManager.address,
            SC_System.ownerAccount.address,
            beginCell().endCell(),
            toNano('0.5'),
            forwardPayload
        );
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: SC_System.game.address,
            success: true,
            op: Opcodes.OP_JETTON_USED,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.game.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_FAST_TRAVEL_UPGRADE,
        });
        SC_System.messageResult = await SC_System.ownerShip.sendFastTravel(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SEND_MOVE,
            targetXY
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: false,
            op: Opcodes.OP_REQUEST_TO_FAST_TRAVEL,
            exitCode: ERR_NOT_ENOUGH_FUEL_FOR_TRAVEL,
        });

        SC_System.messageResult = await SC_System.ownerJettonWallet.sendTransfer(
            SC_System.ownerAccount.getSender(),
            toNano('1'),
            5000n,
            SC_System.gameManager.address,
            SC_System.ownerAccount.address,
            beginCell().endCell(),
            toNano('0.5'),
            forwardPayload
        );
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: SC_System.game.address,
            success: true,
            op: Opcodes.OP_JETTON_USED,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.game.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_FAST_TRAVEL_UPGRADE,
        });
        SC_System.messageResult = await SC_System.ownerShip.sendFastTravel(
            SC_System.ownerAccount.getSender(),
            GAS_COST_SEND_MOVE,
            targetXY
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            success: false,
            op: Opcodes.OP_MOVE,
            exitCode: ERR_FAST_TRAVEL_NOT_ALLOWED_TO_CLOSED_CELLS,
        });


    });
});

