import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, fromNano, toNano } from '@ton/core';
import { Game } from '../wrappers/Game';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Ship } from '../wrappers/Ship';
import { ContractSystem, initContractSystem } from './test_utils';
import { MoveMode } from '../wrappers/structs';
import { Opcodes } from '../wrappers/types';
import { CoordinateCell } from '../wrappers/CoordinateCell';

describe('Game', () => {
    let SC_System: ContractSystem;
    beforeEach(async () => {
        // Create Sandbox and deploy contracts
        SC_System = await initContractSystem();
    })

    it('Get Ship, pop-up ship, move UP', async () => {

        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        let cc_old = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 0n, y: 0n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        let cc_new = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 0n, y: 1n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        
        // console.log('ABRA');
        // console.log(cc_old.address);
        // console.log(cc_new.address);
        
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_MOVE,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerShip.address,
            to: cc_old.address,
            success: true,
            op: Opcodes.OP_MOVE_SHIP_TO_CC,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: cc_old.address,
            to: cc_new.address,
            success: true,
            op: Opcodes.OP_MOVE,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: cc_new.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_MOVE_END,
        });
        console.log(await SC_System.ownerShip.getCurrentGameData());
    });

    it('Get Ship, pop-up ship, move UP x5', async () => {
        console.log("BALANCE");
        console.log(fromNano(await SC_System.ownerAccount.getBalance()));
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_MOVE,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_MOVE_END,
        });

        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        console.log(fromNano(await SC_System.ownerAccount.getBalance()));
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_MOVE,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_MOVE_END,
        });

        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        console.log(fromNano(await SC_System.ownerAccount.getBalance()));
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_MOVE,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_MOVE_END,
        });

        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        console.log(fromNano(await SC_System.ownerAccount.getBalance()));
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_MOVE,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_MOVE_END,
        });

        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        console.log(fromNano(await SC_System.ownerAccount.getBalance()));
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_MOVE,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_MOVE_END,
        });

        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.EXIT);
        console.log(fromNano(await SC_System.ownerAccount.getBalance()));
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_REQUEST_TO_MOVE,
        });
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            to: SC_System.ownerShip.address,
            success: true,
            op: Opcodes.OP_MOVE_END,
        });
        console.log(fromNano(await SC_System.ownerAccount.getBalance()));   
        console.log(await SC_System.ownerShip.getCurrentGameData());
    });


});
