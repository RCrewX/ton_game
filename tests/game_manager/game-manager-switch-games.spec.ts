import { beginCell, toNano, Address, Cell } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { GameManager } from '../../wrappers/game_manager/GameManager';
import { Game } from '../../wrappers/ton_race_game/Game';
import { SoullessSlotMachine } from '../../wrappers/soulless_slot_machine/SoullessSlotMachine';
import { JettonMinter, jettonContentToCell } from '../../wrappers/tep/jetton/JettonMinter';
import { JettonWallet } from '../../wrappers/tep/jetton/JettonWallet';
import { GAS_COST_DEPLOY_JETTON, GAS_COST_SET_GAMES_INFO } from '../../wrappers/game_manager/types';
import { TRY_LUCK_REQUIRED_AMOUNT, Opcodes as SSMOpcodes } from '../../wrappers/soulless_slot_machine/types';
import { Ship } from '../../wrappers/ton_race_game/Ship';
import { MoveMode } from '../../wrappers/ton_race_game/structs';
import { GAS_COST_SEND_MOVE } from '../../wrappers/ton_race_game/types';

describe('GameManager Switch Games', () => {
    let blockchain: Blockchain;
    let ownerAccount: SandboxContract<TreasuryContract>;
    let userAccount: SandboxContract<TreasuryContract>;
    let gameManager: SandboxContract<GameManager>;
    let tonRaceGame: SandboxContract<Game>;
    let ssm: SandboxContract<SoullessSlotMachine>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let userJettonWallet: SandboxContract<JettonWallet>;
    let ownerShip: SandboxContract<Ship>;
    
    let gameManagerCode: Cell;
    let gameCode: Cell;
    let ssmCode: Cell;
    let shipCode: Cell;
    let coordinateCellCode: Cell;
    let jettonMinterCode: Cell;
    let jettonWalletCode: Cell;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        ownerAccount = await blockchain.treasury('owner');
        userAccount = await blockchain.treasury('user');

        // Compile all contracts
        gameManagerCode = await compile('GameManager');
        gameCode = await compile('Game');
        ssmCode = await compile('SoullessSlotMachine');
        shipCode = await compile('Ship');
        coordinateCellCode = await compile('CoordinateCell');
        jettonMinterCode = await compile('JettonMinter');
        jettonWalletCode = await compile('JettonWallet');

        // Deploy GameManager
        gameManager = blockchain.openContract(GameManager.createFromConfig({
            ownerAddress: ownerAccount.address,
        }, gameManagerCode));

        let messageResult = await gameManager.sendDeploy(ownerAccount.getSender(), toNano('0.5'));
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            deploy: true,
            success: true,
        });

        // Deploy TON Race Game
        tonRaceGame = blockchain.openContract(Game.createFromConfig({
            managerAddress: gameManager.address,
            shipCode,
            coordinateCellCode,
        }, gameCode));

        messageResult = await tonRaceGame.sendDeploy(ownerAccount.getSender(), toNano('0.5'));
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: tonRaceGame.address,
            deploy: true,
            success: true,
        });

        // Deploy SSM with GameManager as owner
        ssm = blockchain.openContract(SoullessSlotMachine.createFromConfig({
            ownerAddress: gameManager.address,
        }, ssmCode));

        messageResult = await ssm.sendDeploy(ownerAccount.getSender(), toNano('0.5'));
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: ssm.address,
            deploy: true,
            success: true,
        });

        // Deploy jetton in GameManager
        const jettonContent = jettonContentToCell({ type: 1, uri: 'https://example.com/jetton.json' });
        messageResult = await gameManager.sendDeployJetton(ownerAccount.getSender(), GAS_COST_DEPLOY_JETTON + toNano('0.1'), {
            jettonMinterCode,
            jettonWalletCode,
            jettonContent,
        });
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            success: true,
        });

        // Get jetton minter from game manager
        const jettonInfo = await gameManager.getJettonInfo();
        expect(jettonInfo).not.toBeNull();
        jettonMinter = blockchain.openContract(JettonMinter.createFromAddress(jettonInfo!.jettonMinterAddress));

        // Create user's jetton wallet
        userJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: userAccount.address,
            minterAddress: jettonMinter.address,
        }, jettonWalletCode));

        // Deploy owner's ship for TON Race Game
        ownerShip = blockchain.openContract(Ship.createFromConfig({
            userAddress: ownerAccount.address,
            gameAddress: tonRaceGame.address,
            coordinateCellCode,
        }, shipCode));

        messageResult = await ownerShip.sendDeploy(ownerAccount.getSender(), toNano('5'));
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: ownerShip.address,
            deploy: true,
            success: true,
        });
    }, 100000);

    it('should set TON Race Game as active game and verify minting works', async () => {
        // Set TON Race Game as active game
        const allGamesCell = beginCell()
            .storeUint(1, 2) // mode 1
            .storeAddress(tonRaceGame.address)
            .storeUint(0, 2) // mode 0 (end)
            .endCell();

        let messageResult = await gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            { active_game: tonRaceGame.address, all_games: allGamesCell }
        );

        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            success: true,
        });

        // Verify games info
        const gamesInfo = await gameManager.getGamesInfo();
        expect(gamesInfo).not.toBeNull();
        expect(gamesInfo?.active_game).toEqualAddress(tonRaceGame.address);

        // Test minting works via TON Race Game (ship EXIT move)
        messageResult = await ownerShip.sendMove(ownerAccount.getSender(), GAS_COST_SEND_MOVE, MoveMode.EXIT);
        expect(messageResult.transactions).toHaveTransaction({
            to: ownerShip.address,
            success: true,
        });
    });

    it('should switch from TON Race Game to SSM as active game', async () => {
        // First set TON Race Game as active
        let allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(0, 2)
            .endCell();

        let messageResult = await gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            { active_game: tonRaceGame.address, all_games: allGamesCell }
        );
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            success: true,
        });

        let gamesInfo = await gameManager.getGamesInfo();
        expect(gamesInfo?.active_game).toEqualAddress(tonRaceGame.address);

        // Now switch to SSM as active game
        allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(0, 2)
            .endCell();

        messageResult = await gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            { active_game: ssm.address, all_games: allGamesCell }
        );
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            success: true,
        });

        gamesInfo = await gameManager.getGamesInfo();
        expect(gamesInfo?.active_game).toEqualAddress(ssm.address);
    });

    it('should switch from SSM to TON Race Game as active game', async () => {
        // First set SSM as active
        let allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(0, 2)
            .endCell();

        let messageResult = await gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            { active_game: ssm.address, all_games: allGamesCell }
        );
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            success: true,
        });

        let gamesInfo = await gameManager.getGamesInfo();
        expect(gamesInfo?.active_game).toEqualAddress(ssm.address);

        // Now switch to TON Race Game as active game
        allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(0, 2)
            .endCell();

        messageResult = await gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            { active_game: tonRaceGame.address, all_games: allGamesCell }
        );
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            success: true,
        });

        gamesInfo = await gameManager.getGamesInfo();
        expect(gamesInfo?.active_game).toEqualAddress(tonRaceGame.address);
    });

    it('should allow both games to mint when in all_games list (with enough value)', async () => {
        // Set TON Race Game as active, SSM as secondary
        const allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(0, 2)
            .endCell();

        let messageResult = await gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            { active_game: tonRaceGame.address, all_games: allGamesCell }
        );
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            success: true,
        });

        // TON Race Game (active) can mint with normal value
        messageResult = await ownerShip.sendMove(ownerAccount.getSender(), GAS_COST_SEND_MOVE, MoveMode.EXIT);
        expect(messageResult.transactions).toHaveTransaction({
            to: ownerShip.address,
            success: true,
        });

        // SSM (not active but in all_games) can mint when user wins
        // We need to try multiple times due to 5% chance
        let ssmMintSuccess = false;
        for (let i = 0; i < 100 && !ssmMintSuccess; i++) {
            messageResult = await ssm.sendTryLuck(
                userAccount.getSender(),
                TRY_LUCK_REQUIRED_AMOUNT + toNano('0.5'), // Extra for gas
                BigInt(i)
            );

            // Check if mint request was sent to GameManager
            const hasMintRequest = messageResult.transactions.some(tx => {
                if (tx.inMessage?.info.type !== 'internal') return false;
                if (!tx.inMessage?.info.dest?.equals(gameManager.address)) return false;
                try {
                    const body = tx.inMessage?.body?.beginParse();
                    if (!body) return false;
                    const op = body.loadUint(32);
                    return op === SSMOpcodes.OP_FORWARD_MINT_REQUEST;
                } catch {
                    return false;
                }
            });

            if (hasMintRequest) {
                ssmMintSuccess = true;
                
                // Verify the mint flow succeeded through GameManager
                const hasJettonMinterTx = messageResult.transactions.some(tx =>
                    tx.inMessage?.info.type === 'internal' &&
                    tx.inMessage?.info.dest?.equals(jettonMinter.address)
                );
                expect(hasJettonMinterTx).toBe(true);
            }
        }

        expect(ssmMintSuccess).toBe(true);
    });

    it('should reject minting from game not in all_games list', async () => {
        // Set only TON Race Game in games list
        const allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(0, 2)
            .endCell();

        let messageResult = await gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            { active_game: tonRaceGame.address, all_games: allGamesCell }
        );
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            success: true,
        });

        // SSM is not in games list, so minting should fail
        // We need to try multiple times due to 5% chance to even get a win
        for (let i = 0; i < 100; i++) {
            messageResult = await ssm.sendTryLuck(
                userAccount.getSender(),
                TRY_LUCK_REQUIRED_AMOUNT + toNano('0.5'),
                BigInt(i)
            );

            // Check if mint request was sent to GameManager
            const hasMintRequest = messageResult.transactions.some(tx => {
                if (tx.inMessage?.info.type !== 'internal') return false;
                if (!tx.inMessage?.info.dest?.equals(gameManager.address)) return false;
                try {
                    const body = tx.inMessage?.body?.beginParse();
                    if (!body) return false;
                    const op = body.loadUint(32);
                    return op === SSMOpcodes.OP_FORWARD_MINT_REQUEST;
                } catch {
                    return false;
                }
            });

            if (hasMintRequest) {
                // If a win occurred, the mint request to GameManager should fail
                // because SSM is not in the games list
                const gmTx = messageResult.transactions.find(tx =>
                    tx.inMessage?.info.type === 'internal' &&
                    tx.inMessage?.info.dest?.equals(gameManager.address) &&
                    (() => {
                        try {
                            const body = tx.inMessage?.body?.beginParse();
                            if (!body) return false;
                            const op = body.loadUint(32);
                            return op === SSMOpcodes.OP_FORWARD_MINT_REQUEST;
                        } catch {
                            return false;
                        }
                    })()
                );

                if (gmTx) {
                    // The GameManager should reject this with ERR_GAME_NOT_FOUND (930)
                    expect(gmTx.description.type).toBe('generic');
                    if (gmTx.description.type === 'generic') {
                        expect(gmTx.description.computePhase?.type).toBe('vm');
                        if (gmTx.description.computePhase?.type === 'vm') {
                            // Note: With value < 0.2 TON, it should fail with ERR_INVALID_GAME_SENDER (921)
                            // With value >= 0.2 TON, it should fail with ERR_GAME_NOT_FOUND (930)
                            const exitCode = gmTx.description.computePhase.exitCode;
                            expect([921, 930]).toContain(exitCode);
                        }
                    }
                    break; // We found and verified a failed mint attempt
                }
            }
        }
    });

    it('should validate that first game in all_games matches active_game', async () => {
        // Try to set SSM as active but put TON Race Game first in list - should fail
        const invalidGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address) // Wrong first game
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(0, 2)
            .endCell();

        const messageResult = await gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            { active_game: ssm.address, all_games: invalidGamesCell }
        );

        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            success: false,
            exitCode: 929, // ERR_INVALID_GAMES_INFO
        });
    });
});
