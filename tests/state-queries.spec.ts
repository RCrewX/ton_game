import { toNano } from '@ton/core';
import '@ton/test-utils';
import { ContractSystem, initContractSystem } from './test_utils';
import { MoveMode } from '../wrappers/game/structs';
import { CoordinateCell } from '../wrappers/game/CoordinateCell';
import { GAS_COST_REQUEST_TO_MOVE } from '../wrappers/game/types';

describe('State Queries', () => {
    let SC_System: ContractSystem;
    beforeEach(async () => {
        SC_System = await initContractSystem();
    }, 100000);

    it('Test Ship getCurrentGameData - verify initial state', async () => {
        const gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).toBeNull(); // Should be null before first move
    });

    it('Test Ship getCurrentGameData - verify after move', async () => {
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), GAS_COST_REQUEST_TO_MOVE, MoveMode.UP);
        
        const gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(0n);
            expect(gameData.xy.y).toBe(1n);
            expect(gameData.hp).toBeGreaterThan(0n);
            expect(gameData.jettonAmount).toBeGreaterThanOrEqual(0n);
        }
    });

    it('Test Ship getTonBalance', async () => {
        const balance = await SC_System.ownerShip.getTonBalance();
        expect(balance).toBeGreaterThan(0n);
    });

    it('Test CoordinateCell getTonBalance', async () => {
        // First move to create a coordinate cell
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), GAS_COST_REQUEST_TO_MOVE, MoveMode.UP);
        
        const cc = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 0n, y: 1n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        
        const balance = await cc.getTonBalance();
        expect(balance).toBeGreaterThanOrEqual(0n);
    });
});

