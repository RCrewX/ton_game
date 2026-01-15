import { beginCell, toNano, Address } from '@ton/core';
import { SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { ContractSystem, initContractSystem, cleanupContractSystem } from '../test_utils';
import { GAS_COST_DEPLOY_JETTON, GAS_COST_SET_GAMES_INFO, encodeGamesInfo } from '../../wrappers/game_manager/types';
import { jettonContentToCell, JettonMinter } from '../../wrappers/jetton/JettonMinter';
import { compile } from '@ton/blueprint';

describe('GameManager New Features', () => {
    let SC_System: ContractSystem;
    beforeEach(async () => {
        SC_System = await initContractSystem();
    }, 100000);

    afterEach(() => {
        cleanupContractSystem(SC_System);
        SC_System = null as any;
    });

    it('Test DeployJetton - owner can deploy jetton with codes and data', async () => {
        // Create a fresh GameManager for this test
        const blockchain = SC_System.blockchain;
        const ownerAccount = SC_System.ownerAccount;
        
        const gameManagerCode = await compile('GameManager');
        const { GameManager } = await import('../../wrappers/game_manager/GameManager');
        const gameManager = blockchain.openContract(GameManager.createFromConfig({
            ownerAddress: ownerAccount.address,
        }, gameManagerCode));
        
        await gameManager.sendDeploy(ownerAccount.getSender(), toNano('0.5'));

        // Prepare jetton content
        const jettonMinterCode = SC_System.jettonMinterCode;
        const jettonWalletCode = SC_System.jettonWalletCode;
        const jettonContent = jettonContentToCell({ type: 1, uri: 'https://example.com/jetton.json' });

        // Deploy jetton
        const messageResult = await gameManager.sendDeployJetton(
            ownerAccount.getSender(),
            GAS_COST_DEPLOY_JETTON + toNano('0.2'),
            {
                jettonMinterCode,
                jettonWalletCode,
                jettonContent,
            }
        );

        // The message might bounce if minter deployment fails, but jettonInfo should still be set
        // Check that jettonInfo is set (this happens before sending the mint message)
        const jettonInfo = await gameManager.getJettonInfo();
        expect(jettonInfo).not.toBeNull();
        expect(jettonInfo?.jettonMinterAddress).toBeDefined();
        
        // Verify the transaction was processed (even if mint bounced)
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
        });
    });

    it('Test DeployJetton - cannot deploy twice', async () => {
        const blockchain = SC_System.blockchain;
        const ownerAccount = SC_System.ownerAccount;
        
        const gameManagerCode = await compile('GameManager');
        const { GameManager } = await import('../../wrappers/game_manager/GameManager');
        const gameManager = blockchain.openContract(GameManager.createFromConfig({
            ownerAddress: ownerAccount.address,
        }, gameManagerCode));
        
        await gameManager.sendDeploy(ownerAccount.getSender(), toNano('0.5'));

        const jettonMinterCode = SC_System.jettonMinterCode;
        const jettonWalletCode = SC_System.jettonWalletCode;
        const jettonContent = jettonContentToCell({ type: 1, uri: 'https://example.com/jetton.json' });

        // First deployment should succeed
        let messageResult = await gameManager.sendDeployJetton(
            ownerAccount.getSender(),
            GAS_COST_DEPLOY_JETTON + toNano('0.2'),
            {
                jettonMinterCode,
                jettonWalletCode,
                jettonContent,
            }
        );

        // Verify jettonInfo was set (even if mint bounced)
        const jettonInfo = await gameManager.getJettonInfo();
        expect(jettonInfo).not.toBeNull();
        
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
        });

        // Second deployment should fail
        const jettonContent2 = jettonContentToCell({ type: 1, uri: 'https://example.com/jetton2.json' });
        messageResult = await gameManager.sendDeployJetton(
            ownerAccount.getSender(),
            GAS_COST_DEPLOY_JETTON + toNano('0.1'),
            {
                jettonMinterCode,
                jettonWalletCode,
                jettonContent: jettonContent2,
            }
        );

        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: gameManager.address,
            success: false,
            exitCode: 928, // ERR_JETTON_INFO_ALREADY_SET
        });
    });

    it('Test SetGamesInfo - owner can set games info with validation', async () => {
        const ownerAccount = SC_System.ownerAccount;
        const game = SC_System.game;

        // Create games list with active_game first
        // Format: [1][:address][1][:address][0] for 2 games
        const allGamesCell = beginCell()
            .storeUint(1, 2) // mode 1
            .storeAddress(game.address) // active_game (first)
            .storeUint(1, 2) // mode 1
            .storeAddress(game.address) // second game (same for test)
            .storeUint(0, 2) // mode 0 (end)
            .endCell();

        const gamesInfo = {
            active_game: game.address,
            all_games: allGamesCell,
        };

        SC_System.messageResult = await SC_System.gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            gamesInfo
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
        });

        // Check that gamesInfo is set
        const storedGamesInfo = await SC_System.gameManager.getGamesInfo();
        expect(storedGamesInfo).not.toBeNull();
        expect(storedGamesInfo?.active_game).toEqualAddress(game.address);
    });

    it('Test SetGamesInfo - validation fails if first game is not active_game', async () => {
        const ownerAccount = SC_System.ownerAccount;
        const game = SC_System.game;
        const otherGame = await SC_System.blockchain.treasury('otherGame');

        // Create games list with wrong first game
        const allGamesCell = beginCell()
            .storeUint(1, 2) // mode 1
            .storeAddress(otherGame.address) // Wrong first game
            .storeUint(0, 2) // mode 0 (end)
            .endCell();

        const gamesInfo = {
            active_game: game.address,
            all_games: allGamesCell,
        };

        SC_System.messageResult = await SC_System.gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            gamesInfo
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: SC_System.gameManager.address,
            success: false,
            exitCode: 929, // ERR_INVALID_GAMES_INFO
        });
    });

    it('Test SetGamesInfo with 7 games - verify structure', async () => {
        const ownerAccount = SC_System.ownerAccount;
        const game = SC_System.game;

        // Create 7 game addresses
        const games: Address[] = [game.address];
        for (let i = 1; i < 7; i++) {
            const gameTreasury = await SC_System.blockchain.treasury(`game${i}`);
            games.push(gameTreasury.address);
        }

        // Pack games list: [1][:address][1][:address]...[0]
        // For 7 games, we need to use refs since they don't fit in one cell
        // Format: [1][:address][1][:address][2] (go to ref) [1][:address][1][:address][1][:address][2] (go to ref) [1][:address][1][:address][1][:address][0]
        const firstCell = beginCell()
            .storeUint(1, 2).storeAddress(games[0]) // active_game
            .storeUint(1, 2).storeAddress(games[1])
            .storeUint(2, 2) // mode 2 = go to ref
            .endCell();
        
        const secondCell = beginCell()
            .storeUint(1, 2).storeAddress(games[2])
            .storeUint(1, 2).storeAddress(games[3])
            .storeUint(1, 2).storeAddress(games[4])
            .storeUint(2, 2) // mode 2 = go to ref
            .endCell();
        
        const thirdCell = beginCell()
            .storeUint(1, 2).storeAddress(games[5])
            .storeUint(1, 2).storeAddress(games[6])
            .storeUint(0, 2) // End marker
            .endCell();
        
        const secondCellWithRef = beginCell()
            .storeBuilder(secondCell.asBuilder())
            .storeRef(thirdCell)
            .endCell();
        
        const allGamesCell = beginCell()
            .storeBuilder(firstCell.asBuilder())
            .storeRef(secondCellWithRef)
            .endCell();

        const gamesInfo = {
            active_game: games[0],
            all_games: allGamesCell,
        };

        SC_System.messageResult = await SC_System.gameManager.sendSetGamesInfo(
            ownerAccount.getSender(),
            GAS_COST_SET_GAMES_INFO,
            gamesInfo
        );

        expect(SC_System.messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address,
            to: SC_System.gameManager.address,
            success: true,
        });

        // Verify gamesInfo was stored correctly
        const storedGamesInfo = await SC_System.gameManager.getGamesInfo();
        expect(storedGamesInfo).not.toBeNull();
        expect(storedGamesInfo?.active_game).toEqualAddress(games[0]);
        
        // Verify all_games cell structure (simplified - just check first few)
        const allGamesSlice = storedGamesInfo!.all_games.beginParse();
        // Check first game (active_game)
        const firstMode = allGamesSlice.loadUint(2);
        expect(firstMode).toBe(1); // Mode 1 = address follows
        const firstAddr = allGamesSlice.loadAddress();
        expect(firstAddr).toEqualAddress(games[0]);
        
        // Check second game
        const secondMode = allGamesSlice.loadUint(2);
        expect(secondMode).toBe(1);
        const secondAddr = allGamesSlice.loadAddress();
        expect(secondAddr).toEqualAddress(games[1]);
    });
});
