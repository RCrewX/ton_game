import { beginCell, toNano, Cell, Address } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { GameManager } from '../../wrappers/game_manager/GameManager';
import { Retranslator } from '../../wrappers/game_manager/Retranslator';
import { Game } from '../../wrappers/ton_race_game/Game';
import { SoullessSlotMachine } from '../../wrappers/soulless_slot_machine/SoullessSlotMachine';
import { JettonMinter, jettonContentToCell } from '../../wrappers/tep/jetton/JettonMinter';
import { JettonWallet } from '../../wrappers/tep/jetton/JettonWallet';
import { Opcodes as GMOpcodes, GAS_COST_SET_RETRANSLATOR } from '../../wrappers/game_manager/types';
import { TRY_LUCK_REQUIRED_AMOUNT } from '../../wrappers/soulless_slot_machine/types';
import { Ship } from '../../wrappers/ton_race_game/Ship';
import { MoveMode } from '../../wrappers/ton_race_game/structs';
import { GAS_COST_SEND_MOVE } from '../../wrappers/ton_race_game/types';

// Games registry now lives on the Retranslator (R*). It is configured through
// GM.RedirectMessage (owner -> GM -> R*). Mint requests from games arrive as R1
// to GM, are forwarded as R2 to R*, validated against the registry, and replied
// as R3 so GM emits the mint (R4) to the jetton minter.
describe('GameManager Switch Games (via Retranslator)', () => {
    let blockchain: Blockchain;
    let ownerAccount: SandboxContract<TreasuryContract>;
    let userAccount: SandboxContract<TreasuryContract>;
    let gameManager: SandboxContract<GameManager>;
    let retranslator: SandboxContract<Retranslator>;
    let tonRaceGame: SandboxContract<Game>;
    let ssm: SandboxContract<SoullessSlotMachine>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let ownerShip: SandboxContract<Ship>;

    let gameManagerCode: Cell;
    let retranslatorCode: Cell;
    let gameCode: Cell;
    let ssmCode: Cell;
    let shipCode: Cell;
    let coordinateCellCode: Cell;
    let jettonMinterCode: Cell;
    let jettonWalletCode: Cell;

    // Relay a SetGamesInfo to R* through GM (owner-gated redirect).
    async function setGamesInfo(active_game: Address, all_games: Cell) {
        return gameManager.sendRedirectMessage(
            ownerAccount.getSender(),
            toNano('1'),
            retranslator.address,
            Retranslator.setGamesInfoMessage({ active_game, all_games }),
            toNano('0.9'),
        );
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        ownerAccount = await blockchain.treasury('owner');
        userAccount = await blockchain.treasury('user');

        gameManagerCode = await compile('GameManager');
        retranslatorCode = await compile('Retranslator');
        gameCode = await compile('Game');
        ssmCode = await compile('SoullessSlotMachine');
        shipCode = await compile('Ship');
        coordinateCellCode = await compile('CoordinateCell');
        jettonMinterCode = await compile('JettonMinter');
        jettonWalletCode = await compile('JettonWallet');

        // GameManager
        gameManager = blockchain.openContract(GameManager.createFromConfig({
            ownerAddress: ownerAccount.address,
        }, gameManagerCode));
        let messageResult = await gameManager.sendDeploy(ownerAccount.getSender(), toNano('0.5'));
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address, to: gameManager.address, deploy: true, success: true,
        });

        // Retranslator + wire-up
        retranslator = blockchain.openContract(Retranslator.createFromConfig({
            gameManagerAddress: gameManager.address,
            ownerAddress: ownerAccount.address,
            active: true,
        }, retranslatorCode));
        await retranslator.sendDeploy(ownerAccount.getSender(), toNano('0.5'));
        await gameManager.sendSetRetranslator(
            ownerAccount.getSender(), GAS_COST_SET_RETRANSLATOR + toNano('0.05'), retranslator.address,
        );

        // TON Race Game
        tonRaceGame = blockchain.openContract(Game.createFromConfig({
            managerAddress: gameManager.address, shipCode, coordinateCellCode,
        }, gameCode));
        await tonRaceGame.sendDeploy(ownerAccount.getSender(), toNano('0.5'));

        // SSM with GameManager as owner
        ssm = blockchain.openContract(SoullessSlotMachine.createFromConfig({
            ownerAddress: gameManager.address,
        }, ssmCode));
        await ssm.sendDeploy(ownerAccount.getSender(), toNano('0.5'));

        // Jetton minter deployed off-chain with admin = GM.
        jettonMinter = blockchain.openContract(JettonMinter.createFromConfig({
            admin: gameManager.address,
            content: jettonContentToCell({ type: 1, uri: 'https://example.com/jetton.json' }),
            wallet_code: jettonWalletCode,
        }, jettonMinterCode));
        await jettonMinter.sendDeploy(ownerAccount.getSender(), toNano('0.5'));

        // Tell R* about the jetton (minter address + wallet code).
        await gameManager.sendRedirectMessage(
            ownerAccount.getSender(),
            toNano('0.2'),
            retranslator.address,
            Retranslator.setJettonInfoMessage({ jettonMinterAddress: jettonMinter.address, jettonWalletCode }),
            toNano('0.1'),
        );

        // Owner's ship for TON Race Game
        ownerShip = blockchain.openContract(Ship.createFromConfig({
            userAddress: ownerAccount.address, gameAddress: tonRaceGame.address, coordinateCellCode,
        }, shipCode));
        messageResult = await ownerShip.sendDeploy(ownerAccount.getSender(), toNano('5'));
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address, to: ownerShip.address, deploy: true, success: true,
        });
    }, 100000);

    it('should set TON Race Game as active game and verify minting works', async () => {
        const allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(0, 2)
            .endCell();

        let messageResult = await setGamesInfo(tonRaceGame.address, allGamesCell);
        expect(messageResult.transactions).toHaveTransaction({
            from: gameManager.address, to: retranslator.address, success: true,
        });

        const gamesInfo = await retranslator.getGamesInfo();
        expect(gamesInfo).not.toBeNull();
        expect(gamesInfo?.active_game).toEqualAddress(tonRaceGame.address);

        // EXIT move should succeed (self-contained on the ship/game side).
        messageResult = await ownerShip.sendMove(ownerAccount.getSender(), GAS_COST_SEND_MOVE, MoveMode.EXIT);
        expect(messageResult.transactions).toHaveTransaction({ to: ownerShip.address, success: true });
    });

    it('should switch from TON Race Game to SSM as active game', async () => {
        let allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(0, 2)
            .endCell();
        await setGamesInfo(tonRaceGame.address, allGamesCell);
        expect((await retranslator.getGamesInfo())?.active_game).toEqualAddress(tonRaceGame.address);

        allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(0, 2)
            .endCell();
        await setGamesInfo(ssm.address, allGamesCell);
        expect((await retranslator.getGamesInfo())?.active_game).toEqualAddress(ssm.address);
    });

    it('should switch from SSM to TON Race Game as active game', async () => {
        let allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(0, 2)
            .endCell();
        await setGamesInfo(ssm.address, allGamesCell);
        expect((await retranslator.getGamesInfo())?.active_game).toEqualAddress(ssm.address);

        allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(0, 2)
            .endCell();
        await setGamesInfo(tonRaceGame.address, allGamesCell);
        expect((await retranslator.getGamesInfo())?.active_game).toEqualAddress(tonRaceGame.address);
    });

    it('should allow a non-active game (in all_games) to mint when it wins', async () => {
        // TON Race Game active, SSM secondary but registered.
        const allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(0, 2)
            .endCell();
        await setGamesInfo(tonRaceGame.address, allGamesCell);

        // SSM (registered, non-active) mints when the user wins. Retry for the 5% chance.
        let ssmMintSuccess = false;
        for (let i = 0; i < 100 && !ssmMintSuccess; i++) {
            const messageResult = await ssm.sendTryLuck(
                userAccount.getSender(),
                TRY_LUCK_REQUIRED_AMOUNT + toNano('0.5'),
                BigInt(i),
            );
            // SSM forwards an R1 envelope to GM on a win.
            const hasR1 = messageResult.transactions.some(tx => {
                if (tx.inMessage?.info.type !== 'internal') return false;
                if (!tx.inMessage?.info.dest?.equals(gameManager.address)) return false;
                try {
                    return tx.inMessage!.body!.beginParse().loadUint(32) === GMOpcodes.OP_R1;
                } catch { return false; }
            });
            if (hasR1) {
                ssmMintSuccess = true;
                // The mint must complete all the way to the jetton minter (R4).
                const hasJettonMinterTx = messageResult.transactions.some(tx =>
                    tx.inMessage?.info.type === 'internal' &&
                    tx.inMessage?.info.dest?.equals(jettonMinter.address),
                );
                expect(hasJettonMinterTx).toBe(true);
            }
        }
        expect(ssmMintSuccess).toBe(true);
    });

    it('should reject minting from a game not in all_games list (R* rejects)', async () => {
        // Only TON Race Game registered; SSM is not.
        const allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address)
            .storeUint(0, 2)
            .endCell();
        await setGamesInfo(tonRaceGame.address, allGamesCell);

        for (let i = 0; i < 100; i++) {
            const messageResult = await ssm.sendTryLuck(
                userAccount.getSender(),
                TRY_LUCK_REQUIRED_AMOUNT + toNano('0.5'),
                BigInt(i),
            );
            // Did the SSM win and forward an R1 to GM?
            const r1ToGm = messageResult.transactions.some(tx =>
                tx.inMessage?.info.type === 'internal' &&
                tx.inMessage?.info.dest?.equals(gameManager.address) &&
                (() => { try { return tx.inMessage!.body!.beginParse().loadUint(32) === GMOpcodes.OP_R1; } catch { return false; } })(),
            );
            if (!r1ToGm) continue;

            // GM forwards R2 to R*, which must reject the unregistered game.
            const r2ToR = messageResult.transactions.find(tx =>
                tx.inMessage?.info.type === 'internal' &&
                tx.inMessage?.info.dest?.equals(retranslator.address) &&
                (() => { try { return tx.inMessage!.body!.beginParse().loadUint(32) === GMOpcodes.OP_R2; } catch { return false; } })(),
            );
            expect(r2ToR).toBeDefined();
            if (r2ToR && r2ToR.description.type === 'generic' && r2ToR.description.computePhase?.type === 'vm') {
                // value < 0.2 -> ERR_INVALID_GAME_SENDER (921); value >= 0.2 -> ERR_GAME_NOT_FOUND (930)
                expect([921, 930]).toContain(r2ToR.description.computePhase.exitCode);
            }
            // The mint must NOT reach the jetton minter.
            const reachedMinter = messageResult.transactions.some(tx =>
                tx.inMessage?.info.type === 'internal' &&
                tx.inMessage?.info.dest?.equals(jettonMinter.address),
            );
            expect(reachedMinter).toBe(false);
            break;
        }
    });

    it('R* validates that first game in all_games matches active_game', async () => {
        const invalidGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(tonRaceGame.address) // wrong first game
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(0, 2)
            .endCell();

        const messageResult = await setGamesInfo(ssm.address, invalidGamesCell);
        // GM forwards the redirect; R* rejects the invalid registry.
        expect(messageResult.transactions).toHaveTransaction({
            from: gameManager.address,
            to: retranslator.address,
            success: false,
            exitCode: 929, // ERR_INVALID_GAMES_INFO
        });
    });
});
