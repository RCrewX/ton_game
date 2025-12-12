import { toNano } from '@ton/core';
import '@ton/test-utils';
import { ContractSystem, initContractSystem } from './test_utils';
import { MoveMode } from '../wrappers/game/structs';
import { Opcodes } from '../wrappers/game/types';
import { Opcodes as GameManagerOpcodes } from '../wrappers/game_manager/types';
import { JettonMinter } from '../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../wrappers/jetton/JettonWallet';
import { jettonContentToCell } from '../wrappers/jetton/JettonMinter';

describe('Jetton Minting', () => {
    let SC_System: ContractSystem;
    beforeEach(async () => {
        SC_System = await initContractSystem();
    }, 100000);

    it('Test complete minting flow - moves, safe exit, and jetton minting', async () => {
        // // Deploy and set up jetton minter
        // const jettonContent = jettonContentToCell({ type: 1, uri: 'https://example.com/jetton.json' });
        // const jettonMinter = SC_System.blockchain.openContract(JettonMinter.createFromConfig({
        //     admin: SC_System.ownerAccount.address,
        //     content: jettonContent,
        //     wallet_code: SC_System.jettonWalletCode,
        // }, SC_System.jettonMinterCode));

        // await jettonMinter.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

        // // Set jetton minter address in GameManager
        // SC_System.messageResult = await SC_System.gameManager.sendSetJettonMinterAddress(
        //     SC_System.ownerAccount.getSender(),
        //     toNano('0.1'),
        //     jettonMinter.address
        // );

        // expect(SC_System.messageResult.transactions).toHaveTransaction({
        //     from: SC_System.ownerAccount.address,
        //     to: SC_System.gameManager.address,
        //     success: true,
        //     op: GameManagerOpcodes.OP_SET_JETTON_MINTER_ADDRESS,
        // });

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

        // Move 4: RIGHT from (1,3) to (2,4)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.RIGHT);
        gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(2n);
            expect(gameData.xy.y).toBe(4n);
        }

        // Move 5: RIGHT from (2,4) to (3,5)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.RIGHT);
        gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(3n);
            expect(gameData.xy.y).toBe(5n);
        }

        // Move 6: RIGHT from (3,5) to (4,6)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(2), MoveMode.RIGHT);
        gameData = await SC_System.ownerShip.getCurrentGameData();
        expect(gameData).not.toBeNull();
        if (gameData) {
            expect(gameData.xy.x).toBe(4n);
            expect(gameData.xy.y).toBe(6n);
        }
        // Get the accumulated jetton amount before safe exit
        gameData = await SC_System.ownerShip.getCurrentGameData();
        const accumulatedAmount = gameData ? gameData.jettonAmount : 0n;


        expect(accumulatedAmount).toBeGreaterThan(0n);

        // Calculate user's jetton wallet address
        const userJettonWalletAddress = await SC_System.jettonMinter.getWalletAddress(SC_System.ownerAccount.address);
        const userJettonWallet = SC_System.blockchain.openContract(
            JettonWallet.createFromAddress(userJettonWalletAddress)
        );

        // Get initial jetton balance (should be 0)
        const initialJettonBalance = await userJettonWallet.getJettonBalance();
        // expect(initialJettonBalance).toBe(0n);

        // Do safe exit to trigger minting
        // From (1,3), EXIT mode goes to (1,4)
        SC_System.messageResult = await SC_System.ownerShip.sendMove(SC_System.ownerAccount.getSender(), toNano(5), MoveMode.EXIT);

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
            to: SC_System.jettonMinter.address,
            success: true,
        });

        // Verify jettons were minted to user
        const finalJettonBalance = await userJettonWallet.getJettonBalance();
        expect(finalJettonBalance).toBeGreaterThan(initialJettonBalance);
        expect(finalJettonBalance).toBeGreaterThanOrEqual(initialJettonBalance+accumulatedAmount);
    });
});

