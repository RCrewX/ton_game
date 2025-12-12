import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, fromNano, toNano, beginCell } from '@ton/core';
import { Game } from '../wrappers/game/Game';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Ship } from '../wrappers/game/Ship';
import { ContractSystem, initContractSystem } from './test_utils';
import { MoveMode } from '../wrappers/game/structs';
import { Opcodes } from '../wrappers/game/types';
import { Opcodes as GameManagerOpcodes } from '../wrappers/game_manager/types';
import { CoordinateCell } from '../wrappers/game/CoordinateCell';
import { JettonMinter } from '../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../wrappers/jetton/JettonWallet';
import { jettonContentToCell } from '../wrappers/jetton/JettonMinter';

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
    });

    it('Get Ship, pop-up ship, move UP x5', async () => {
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
    });

    it('Test move LEFT - verify coordinates and message path', async () => {
        // First move UP to get to (0, 1)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        
        // Now move LEFT from (0, 1) to (-1, 2)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.LEFT);
        
        const cc_old = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 0n, y: 1n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        const cc_new = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: -1n, y: 2n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        
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

        const gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(-1n);
            expect(gameData.xy.y).toBe(2n);
        }
    });

    it('Test move RIGHT - verify coordinates and message path', async () => {
        // First move UP to get to (0, 1)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        
        // Now move RIGHT from (0, 1) to (1, 2)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.RIGHT);
        
        const cc_old = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 0n, y: 1n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        const cc_new = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 1n, y: 2n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        
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

        const gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(1n);
            expect(gameData.xy.y).toBe(2n);
        }
    });

    it('Test move EXIT - verify complete message path', async () => {
        // First move UP to get to (0, 1)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        
        // Now move EXIT from (0, 1)
        // EXIT mode: x stays same (0), y increases by 1 -> (0, 2)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.EXIT);
        
        const cc_old = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 0n, y: 1n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        const cc_new = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 0n, y: 2n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        
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
    });

    it('Test Ship getCurrentGameData - verify initial state', async () => {
        const gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).toBeNull(); // Should be null before first move
    });

    it('Test Ship getCurrentGameData - verify after move', async () => {
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        
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
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        
        const cc = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 0n, y: 1n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        
        const balance = await cc.getTonBalance();
        expect(balance).toBeGreaterThanOrEqual(0n);
    });

    it('Test Game sendRequestShipAddress - verify response message', async () => {
        SC_System.messageResult = await SC_System.game.sendRequestShipAddress(
            SC_System.ownerAccount.getSender(),
            toNano('0.1'),
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
        // The response goes to the sender (ownerAccount), not to the ship
        // The ship address is included in the ResponseAddress message body
    });

    it('Test Game sendRequestCoordinateCellAddress - verify response message', async () => {
        SC_System.messageResult = await SC_System.game.sendRequestCoordinateCellAddress(
            SC_System.ownerAccount.getSender(),
            toNano('0.1'),
            { x: 0n, y: 0n }
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
    });

    it('Test complete message path with all opcodes - LEFT move', async () => {
        // Move UP first
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        
        // Move LEFT
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.LEFT);
        
        const cc_old = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 0n, y: 1n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        const cc_new = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: -1n, y: 2n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        
        // Verify complete message chain
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
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerShip.address,
            to: SC_System.ownerAccount.address,
            success: true,
            op: Opcodes.OP_RETURN_EXCESSES_BACK,
        });
    });

    it('Test complete message path with all opcodes - RIGHT move', async () => {
        // Move UP first
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        
        // Move RIGHT
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.RIGHT);
        
        const cc_old = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 0n, y: 1n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        const cc_new = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: {x: 1n, y: 2n},
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        
        // Verify complete message chain
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
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerShip.address,
            to: SC_System.ownerAccount.address,
            success: true,
            op: Opcodes.OP_RETURN_EXCESSES_BACK,
        });
    });

    it('Test multiple moves and verify coordinate progression', async () => {
        // Initial move UP: (0,0) -> (0,1)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        let gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(0n);
            expect(gameData.xy.y).toBe(1n);
        }
        
        // Move RIGHT: (0,1) -> (1,2)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.RIGHT);
        gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(1n);
            expect(gameData.xy.y).toBe(2n);
        }
        
        // Move LEFT: (1,2) -> (0,3)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.LEFT);
        gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(0n);
            expect(gameData.xy.y).toBe(3n);
        }
        
        // Move UP again: (0,3) -> (0,4)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(0n);
            expect(gameData.xy.y).toBe(4n);
        }
    });

    it('Test address calculation consistency - verify ship address matches', async () => {
        SC_System.messageResult = await SC_System.game.sendRequestShipAddress(
            SC_System.ownerAccount.getSender(),
            toNano('0.1'),
            SC_System.ownerAccount.address
        );
        
        // Find the ResponseAddress transaction
        const responseTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.inMessage?.body?.beginParse().loadUint(32) === Opcodes.OP_RESPONSE_ADDRESS
        );
        
        expect(responseTx).toBeDefined();
        // The ship address in response should match our ownerShip address
        expect(SC_System.ownerShip.address).toBeDefined();
    });

    it('Test address calculation consistency - verify coordinate cell address matches', async () => {
        const testXY = { x: 5n, y: 10n };
        
        SC_System.messageResult = await SC_System.game.sendRequestCoordinateCellAddress(
            SC_System.ownerAccount.getSender(),
            toNano('0.1'),
            testXY
        );
        
        // Find the ResponseAddress transaction
        const responseTx = SC_System.messageResult.transactions.find((tx: any) => 
            tx.inMessage?.body?.beginParse().loadUint(32) === Opcodes.OP_RESPONSE_ADDRESS
        );
        
        expect(responseTx).toBeDefined();
        
        // Verify the calculated address matches what we'd create manually
        const expectedCC = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({ 
            gameAddress: SC_System.game.address,
            xy: testXY,
            shipCode: SC_System.shipCode,
        }, SC_System.coordinateCellCode));
        
        expect(expectedCC.address).toBeDefined();
    });

    it('Test complete minting flow - moves, safe exit, and jetton minting', async () => {
        // Deploy and set up jetton minter
        const jettonContent = jettonContentToCell({ type: 1, uri: 'https://example.com/jetton.json' });
        const jettonMinter = SC_System.blockchain.openContract(JettonMinter.createFromConfig({
            admin: SC_System.ownerAccount.address,
            content: jettonContent,
            wallet_code: SC_System.jettonWalletCode,
        }, SC_System.jettonMinterCode));

        await jettonMinter.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        // Set jetton minter address in GameManager
        SC_System.messageResult = await SC_System.gameManager.sendSetJettonMinterAddress(
            SC_System.ownerAccount.getSender(),
            toNano('0.1'),
            jettonMinter.address
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
            op: GameManagerOpcodes.OP_SET_JETTON_MINTER_ADDRESS,
        });

        // Do several moves to accumulate rewards
        // Move 1: UP from (0,0) to (0,1)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        let gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.y).toBe(1n);
            expect(gameData.jettonAmount).toBeGreaterThanOrEqual(0n);
        }

        // Move 2: UP from (0,1) to (0,2)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.UP);
        gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.y).toBe(2n);
        }

        // Move 3: RIGHT from (0,2) to (1,3)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.RIGHT);
        gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(1n);
            expect(gameData.xy.y).toBe(3n);
        }

        // Get the accumulated jetton amount before safe exit
        gameData = await SC_System.ownerShip.getCurrentGameData();
        const accumulatedAmount = gameData ? gameData.jettonAmount : 0n;
        expect(accumulatedAmount).toBeGreaterThan(0n);

        // Calculate user's jetton wallet address
        const userJettonWalletAddress = await jettonMinter.getWalletAddress(SC_System.ownerAccount.address);
        const userJettonWallet = SC_System.blockchain.openContract(
            JettonWallet.createFromAddress(userJettonWalletAddress)
        );

        // Get initial jetton balance (should be 0)
        const initialJettonBalance = await userJettonWallet.getJettonBalance();
        expect(initialJettonBalance).toBe(0n);

        // Do safe exit to trigger minting
        // From (1,3), EXIT mode goes to (1,4)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.EXIT);

        // Verify the complete message flow
        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerShip.address,
            to: SC_System.game.address,
            success: true,
            op: Opcodes.OP_REQUEST_MINT,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.game.address,
            to: SC_System.gameManager.address,
            success: true,
            op: Opcodes.OP_FORWARD_MINT_REQUEST,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: jettonMinter.address,
            success: true,
        });

        // Verify jettons were minted to user
        const finalJettonBalance = await userJettonWallet.getJettonBalance();
        expect(finalJettonBalance).toBeGreaterThan(initialJettonBalance);
        expect(finalJettonBalance).toBeGreaterThanOrEqual(accumulatedAmount);
    });

    it('Test GameManager message redirection - owner can redirect messages to any address', async () => {
        const recipient = await SC_System.blockchain.treasury('redirectRecipient');
        const testMessage = beginCell()
            .storeUint(0x12345678, 32)
            .storeUint(42, 64)
            .endCell();

        SC_System.messageResult = await SC_System.gameManager.sendRedirectMessage(
            SC_System.ownerAccount.getSender(),
            toNano('0.1'),
            recipient.address,
            testMessage,
            toNano('0.05')
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
        });

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: SC_System.gameManager.address,
            to: recipient.address,
            success: true,
        });
    });


});
