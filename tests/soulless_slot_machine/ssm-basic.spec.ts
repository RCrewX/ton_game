import { beginCell, toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { SoullessSlotMachine } from '../../wrappers/soulless_slot_machine/SoullessSlotMachine';
import { GameManager } from '../../wrappers/game_manager/GameManager';
import { Retranslator } from '../../wrappers/game_manager/Retranslator';
import { JettonMinter, jettonContentToCell } from '../../wrappers/tep/jetton/JettonMinter';
import { JettonWallet } from '../../wrappers/tep/jetton/JettonWallet';
import { Opcodes as GMOpcodes, GAS_COST_SET_RETRANSLATOR } from '../../wrappers/game_manager/types';
import { ROpcodes } from '../../wrappers/game_manager/RetranslatorTypes';
import {
    TRY_LUCK_REQUIRED_AMOUNT,
    GAS_COST_SET_MINT_AMOUNT,
    DEFAULT_MINT_AMOUNT,
    Opcodes,
} from '../../wrappers/soulless_slot_machine/types';

describe('SoullessSlotMachine Basic (via Retranslator)', () => {
    let blockchain: Blockchain;
    let ownerAccount: SandboxContract<TreasuryContract>;
    let userAccount: SandboxContract<TreasuryContract>;
    let gameManager: SandboxContract<GameManager>;
    let retranslator: SandboxContract<Retranslator>;
    let ssm: SandboxContract<SoullessSlotMachine>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let userJettonWallet: SandboxContract<JettonWallet>;

    let gameManagerCode: Awaited<ReturnType<typeof compile>>;
    let retranslatorCode: Awaited<ReturnType<typeof compile>>;
    let ssmCode: Awaited<ReturnType<typeof compile>>;
    let jettonMinterCode: Awaited<ReturnType<typeof compile>>;
    let jettonWalletCode: Awaited<ReturnType<typeof compile>>;

    // Did the SSM win and forward an R1 envelope to GM?
    function ssmForwardedR1(messageResult: any): boolean {
        return messageResult.transactions.some((tx: any) => {
            if (tx.inMessage?.info.type !== 'internal') return false;
            if (!tx.inMessage?.info.dest?.equals(gameManager.address)) return false;
            try {
                return tx.inMessage.body.beginParse().loadUint(32) === GMOpcodes.OP_R1;
            } catch { return false; }
        });
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        ownerAccount = await blockchain.treasury('owner');
        userAccount = await blockchain.treasury('user');

        gameManagerCode = await compile('GameManager');
        retranslatorCode = await compile('Retranslator');
        ssmCode = await compile('SoullessSlotMachine');
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

        // SSM with GameManager as owner
        ssm = blockchain.openContract(SoullessSlotMachine.createFromConfig({
            ownerAddress: gameManager.address,
        }, ssmCode));
        messageResult = await ssm.sendDeploy(ownerAccount.getSender(), toNano('0.5'));
        expect(messageResult.transactions).toHaveTransaction({
            from: ownerAccount.address, to: ssm.address, deploy: true, success: true,
        });

        // Jetton minter off-chain with admin = GM.
        jettonMinter = blockchain.openContract(JettonMinter.createFromConfig({
            admin: gameManager.address,
            content: jettonContentToCell({ type: 1, uri: 'https://example.com/jetton.json' }),
            wallet_code: jettonWalletCode,
        }, jettonMinterCode));
        await jettonMinter.sendDeploy(ownerAccount.getSender(), toNano('0.5'));

        // Configure R*: jetton + SSM as the active (and only) game.
        await gameManager.sendRedirectMessage(
            ownerAccount.getSender(), toNano('0.2'), retranslator.address,
            Retranslator.setJettonInfoMessage({ jettonMinterAddress: jettonMinter.address, jettonWalletCode }),
            toNano('0.1'),
        );
        const allGamesCell = beginCell()
            .storeUint(1, 2).storeAddress(ssm.address)
            .storeUint(0, 2)
            .endCell();
        await gameManager.sendRedirectMessage(
            ownerAccount.getSender(), toNano('1'), retranslator.address,
            Retranslator.setGamesInfoMessage({ active_game: ssm.address, all_games: allGamesCell }),
            toNano('0.9'),
        );

        userJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: userAccount.address,
            minterAddress: jettonMinter.address,
        }, jettonWalletCode));
    }, 100000);

    it('should deploy SSM with correct initial state', async () => {
        expect(await ssm.getOwnerAddress()).toEqualAddress(gameManager.address);
        expect(await ssm.getMintAmount()).toBe(DEFAULT_MINT_AMOUNT);
    });

    it('should reject TryLuck with less than 1 TON', async () => {
        const messageResult = await ssm.sendTryLuck(userAccount.getSender(), toNano('0.5'), 0n);
        expect(messageResult.transactions).toHaveTransaction({
            from: userAccount.address, to: ssm.address, success: false,
            exitCode: 941, // ERR_INSUFFICIENT_TRY_LUCK_AMOUNT
        });
    });

    it('should accept TryLuck with exactly 1 TON', async () => {
        const messageResult = await ssm.sendTryLuck(userAccount.getSender(), TRY_LUCK_REQUIRED_AMOUNT, 0n);
        expect(messageResult.transactions).toHaveTransaction({
            from: userAccount.address, to: ssm.address, success: true,
        });
    });

    it('should accept TryLuck with more than 1 TON', async () => {
        const messageResult = await ssm.sendTryLuck(userAccount.getSender(), toNano('1.5'), 0n);
        expect(messageResult.transactions).toHaveTransaction({
            from: userAccount.address, to: ssm.address, success: true,
        });
    });

    it('should return excess if TryLuck sent more than 1.2 TON (for both win and lose)', async () => {
        const messageResult = await ssm.sendTryLuck(userAccount.getSender(), toNano('2'), 0n);
        expect(messageResult.transactions).toHaveTransaction({
            from: userAccount.address, to: ssm.address, success: true,
        });
        const hasExcessReturn = messageResult.transactions.some(tx => {
            if (tx.inMessage?.info.type !== 'internal') return false;
            if (!tx.inMessage?.info.dest?.equals(userAccount.address)) return false;
            try {
                return tx.inMessage!.body!.beginParse().loadUint(32) === Opcodes.OP_RETURN_EXCESSES_BACK;
            } catch { return false; }
        });
        expect(hasExcessReturn).toBe(true);
    });

    it('should return excess on win when value > 1.2 TON', async () => {
        let winWithExcessOccurred = false;
        for (let i = 0; i < 100 && !winWithExcessOccurred; i++) {
            const messageResult = await ssm.sendTryLuck(userAccount.getSender(), toNano('2'), BigInt(i));
            if (ssmForwardedR1(messageResult)) {
                const hasExcessReturn = messageResult.transactions.some(tx => {
                    if (tx.inMessage?.info.type !== 'internal') return false;
                    if (!tx.inMessage?.info.dest?.equals(userAccount.address)) return false;
                    try {
                        return tx.inMessage!.body!.beginParse().loadUint(32) === Opcodes.OP_RETURN_EXCESSES_BACK;
                    } catch { return false; }
                });
                expect(hasExcessReturn).toBe(true);
                winWithExcessOccurred = true;
            }
        }
        expect(winWithExcessOccurred).toBe(true);
    });

    it('should allow owner (GameManager) to set mint amount via redirect', async () => {
        const newMintAmount = 200n;
        const setMintAmountMsg = beginCell()
            .storeUint(Opcodes.OP_SET_MINT_AMOUNT, 32)
            .storeCoins(newMintAmount)
            .endCell();
        const messageResult = await gameManager.sendRedirectMessage(
            ownerAccount.getSender(), toNano('0.1'), ssm.address, setMintAmountMsg, GAS_COST_SET_MINT_AMOUNT,
        );
        expect(messageResult.transactions).toHaveTransaction({
            from: gameManager.address, to: ssm.address, success: true,
        });
        expect(await ssm.getMintAmount()).toBe(newMintAmount);
    });

    it('should reject SetMintAmount from non-owner', async () => {
        const messageResult = await ssm.sendSetMintAmount(userAccount.getSender(), GAS_COST_SET_MINT_AMOUNT, 200n);
        expect(messageResult.transactions).toHaveTransaction({
            from: userAccount.address, to: ssm.address, success: false,
            exitCode: 940, // ERR_INVALID_OWNER_SENDER
        });
        expect(await ssm.getMintAmount()).toBe(DEFAULT_MINT_AMOUNT);
    });

    it('should forward an R1{ForwardMintRequest} to GameManager on win', async () => {
        let winOccurred = false;
        for (let i = 0; i < 100 && !winOccurred; i++) {
            const messageResult = await ssm.sendTryLuck(
                userAccount.getSender(), TRY_LUCK_REQUIRED_AMOUNT + toNano('0.5'), BigInt(i),
            );
            const r1Tx = messageResult.transactions.find(tx => {
                if (tx.inMessage?.info.type !== 'internal') return false;
                if (!tx.inMessage?.info.dest?.equals(gameManager.address)) return false;
                try { return tx.inMessage!.body!.beginParse().loadUint(32) === GMOpcodes.OP_R1; }
                catch { return false; }
            });
            if (r1Tx) {
                winOccurred = true;
                // Unwrap R1 -> inner ForwardMintRequest and check receiver/amount.
                const r1 = r1Tx.inMessage!.body!.beginParse();
                expect(r1.loadUint(32)).toBe(GMOpcodes.OP_R1);
                const inner = r1.loadRef().beginParse();
                expect(inner.loadUint(32)).toBe(ROpcodes.OP_FORWARD_MINT_REQUEST);
                expect(inner.loadAddress()).toEqualAddress(userAccount.address);
                expect(inner.loadCoins()).toBe(DEFAULT_MINT_AMOUNT);
            }
        }
        expect(winOccurred).toBe(true);
    });

    it('should successfully mint jettons through the GM->R*->minter chain when winning', async () => {
        let winOccurred = false;
        for (let i = 0; i < 100 && !winOccurred; i++) {
            const messageResult = await ssm.sendTryLuck(
                userAccount.getSender(), TRY_LUCK_REQUIRED_AMOUNT + toNano('0.5'), BigInt(i),
            );
            if (ssmForwardedR1(messageResult)) {
                winOccurred = true;
                const hasMintToJettonMinter = messageResult.transactions.some(tx =>
                    tx.inMessage?.info.type === 'internal' &&
                    tx.inMessage?.info.dest?.equals(jettonMinter.address),
                );
                expect(hasMintToJettonMinter).toBe(true);
            }
        }
        expect(winOccurred).toBe(true);
    });
});
