import { beginCell, toNano, Address } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { SoullessSlotMachine } from '../../wrappers/soulless_slot_machine/SoullessSlotMachine';
import { GameManager } from '../../wrappers/game_manager/GameManager';
import { JettonMinter, jettonContentToCell } from '../../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../../wrappers/jetton/JettonWallet';
import { GAS_COST_DEPLOY_JETTON, GAS_COST_SET_GAMES_INFO } from '../../wrappers/game_manager/types';
import { 
    TRY_LUCK_REQUIRED_AMOUNT, 
    TRY_LUCK_MAX_AMOUNT,
    GAS_COST_SET_MINT_AMOUNT,
    DEFAULT_MINT_AMOUNT,
    Opcodes 
} from '../../wrappers/soulless_slot_machine/types';

describe('SoullessSlotMachine Basic', () => {
    let blockchain: Blockchain;
    let ownerAccount: SandboxContract<TreasuryContract>;
    let userAccount: SandboxContract<TreasuryContract>;
    let gameManager: SandboxContract<GameManager>;
    let ssm: SandboxContract<SoullessSlotMachine>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let userJettonWallet: SandboxContract<JettonWallet>;
    
    let gameManagerCode: Awaited<ReturnType<typeof compile>>;
    let ssmCode: Awaited<ReturnType<typeof compile>>;
    let jettonMinterCode: Awaited<ReturnType<typeof compile>>;
    let jettonWalletCode: Awaited<ReturnType<typeof compile>>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        ownerAccount = await blockchain.treasury('owner');
        userAccount = await blockchain.treasury('user');

        // Compile contracts
        gameManagerCode = await compile('GameManager');
        ssmCode = await compile('SoullessSlotMachine');
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

        // Set SSM as active game in games info
        const allGamesCell = beginCell()
            .storeUint(1, 2) // mode 1
            .storeAddress(ssm.address)
            .storeUint(0, 2) // mode 0 (end)
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

        // Create user's jetton wallet
        userJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: userAccount.address,
            minterAddress: jettonMinter.address,
        }, jettonWalletCode));
    }, 100000);

    it('should deploy SSM with correct initial state', async () => {
        const owner = await ssm.getOwnerAddress();
        expect(owner).toEqualAddress(gameManager.address);

        const mintAmount = await ssm.getMintAmount();
        expect(mintAmount).toBe(DEFAULT_MINT_AMOUNT);
    });

    it('should reject TryLuck with less than 1 TON', async () => {
        const messageResult = await ssm.sendTryLuck(
            userAccount.getSender(),
            toNano('0.5'), // Less than 1 TON
            0n
        );

        expect(messageResult.transactions).toHaveTransaction({
            from: userAccount.address,
            to: ssm.address,
            success: false,
            exitCode: 941, // ERR_INSUFFICIENT_TRY_LUCK_AMOUNT
        });
    });

    it('should accept TryLuck with exactly 1 TON', async () => {
        const messageResult = await ssm.sendTryLuck(
            userAccount.getSender(),
            TRY_LUCK_REQUIRED_AMOUNT,
            0n
        );

        expect(messageResult.transactions).toHaveTransaction({
            from: userAccount.address,
            to: ssm.address,
            success: true,
        });
    });

    it('should accept TryLuck with more than 1 TON', async () => {
        const messageResult = await ssm.sendTryLuck(
            userAccount.getSender(),
            toNano('1.5'),
            0n
        );

        expect(messageResult.transactions).toHaveTransaction({
            from: userAccount.address,
            to: ssm.address,
            success: true,
        });
    });

    it('should return excess if TryLuck sent more than 1.2 TON (for both win and lose)', async () => {
        // Send 2 TON (more than 1.2 TON threshold)
        // Excess should ALWAYS be returned regardless of win/lose
        const messageResult = await ssm.sendTryLuck(
            userAccount.getSender(),
            toNano('2'),
            0n
        );

        expect(messageResult.transactions).toHaveTransaction({
            from: userAccount.address,
            to: ssm.address,
            success: true,
        });

        // Excess should ALWAYS be returned when value > 1.2 TON
        const hasExcessReturn = messageResult.transactions.some(tx => {
            if (tx.inMessage?.info.type !== 'internal') return false;
            if (!tx.inMessage?.info.dest?.equals(userAccount.address)) return false;
            // Check for ReturnExcessesBack opcode
            try {
                const body = tx.inMessage?.body?.beginParse();
                if (!body) return false;
                const op = body.loadUint(32);
                return op === Opcodes.OP_RETURN_EXCESSES_BACK;
            } catch {
                return false;
            }
        });
        
        expect(hasExcessReturn).toBe(true);
    });

    it('should return excess on win when value > 1.2 TON', async () => {
        // Run multiple TryLuck attempts with high value to get a win with excess
        let winWithExcessOccurred = false;
        
        for (let i = 0; i < 100 && !winWithExcessOccurred; i++) {
            const messageResult = await ssm.sendTryLuck(
                userAccount.getSender(),
                toNano('2'), // More than 1.2 TON threshold
                BigInt(i)
            );

            // Check if mint request was sent to GameManager (indicates win)
            const hasMintRequest = messageResult.transactions.some(tx => {
                if (tx.inMessage?.info.type !== 'internal') return false;
                if (!tx.inMessage?.info.dest?.equals(gameManager.address)) return false;
                try {
                    const body = tx.inMessage?.body?.beginParse();
                    if (!body) return false;
                    const op = body.loadUint(32);
                    return op === Opcodes.OP_FORWARD_MINT_REQUEST;
                } catch {
                    return false;
                }
            });

            if (hasMintRequest) {
                // Check that excess was also returned
                const hasExcessReturn = messageResult.transactions.some(tx => {
                    if (tx.inMessage?.info.type !== 'internal') return false;
                    if (!tx.inMessage?.info.dest?.equals(userAccount.address)) return false;
                    try {
                        const body = tx.inMessage?.body?.beginParse();
                        if (!body) return false;
                        const op = body.loadUint(32);
                        return op === Opcodes.OP_RETURN_EXCESSES_BACK;
                    } catch {
                        return false;
                    }
                });
                
                expect(hasExcessReturn).toBe(true);
                winWithExcessOccurred = true;
            }
        }

        // With 5% chance, running 100 tries gives >99.4% probability of at least one win
        expect(winWithExcessOccurred).toBe(true);
    });

    it('should allow owner (GameManager) to set mint amount via redirect', async () => {
        const newMintAmount = 200n;
        
        // Create SetMintAmount message
        const setMintAmountMsg = beginCell()
            .storeUint(Opcodes.OP_SET_MINT_AMOUNT, 32)
            .storeCoins(newMintAmount)
            .endCell();
        
        // Send via GameManager redirect
        const messageResult = await gameManager.sendRedirectMessage(
            ownerAccount.getSender(),
            toNano('0.1'),
            ssm.address,
            setMintAmountMsg,
            GAS_COST_SET_MINT_AMOUNT
        );

        expect(messageResult.transactions).toHaveTransaction({
            from: gameManager.address,
            to: ssm.address,
            success: true,
        });

        // Verify mint amount changed
        const mintAmount = await ssm.getMintAmount();
        expect(mintAmount).toBe(newMintAmount);
    });

    it('should reject SetMintAmount from non-owner', async () => {
        const newMintAmount = 200n;
        
        const messageResult = await ssm.sendSetMintAmount(
            userAccount.getSender(),
            GAS_COST_SET_MINT_AMOUNT,
            newMintAmount
        );

        expect(messageResult.transactions).toHaveTransaction({
            from: userAccount.address,
            to: ssm.address,
            success: false,
            exitCode: 940, // ERR_INVALID_OWNER_SENDER
        });

        // Verify mint amount unchanged
        const mintAmount = await ssm.getMintAmount();
        expect(mintAmount).toBe(DEFAULT_MINT_AMOUNT);
    });

    it('should send ForwardMintRequest to GameManager on win', async () => {
        // Run multiple TryLuck attempts to statistically get a win
        // With 5% chance, we should see a win within ~50 tries with high probability
        // For testing, we'll run a few attempts and check the flow works
        
        let winOccurred = false;
        
        for (let i = 0; i < 100 && !winOccurred; i++) {
            const messageResult = await ssm.sendTryLuck(
                userAccount.getSender(),
                TRY_LUCK_REQUIRED_AMOUNT + toNano('0.5'), // Extra for gas
                BigInt(i) // Different queryId each time
            );

            // Check if mint request was sent to GameManager
            const hasMintRequest = messageResult.transactions.some(tx => {
                if (tx.inMessage?.info.type !== 'internal') return false;
                if (!tx.inMessage?.info.dest?.equals(gameManager.address)) return false;
                // Check for ForwardMintRequest opcode in body
                try {
                    const body = tx.inMessage?.body?.beginParse();
                    if (!body) return false;
                    const op = body.loadUint(32);
                    return op === Opcodes.OP_FORWARD_MINT_REQUEST;
                } catch {
                    return false;
                }
            });

            if (hasMintRequest) {
                winOccurred = true;
                
                // Verify the message content
                const mintTx = messageResult.transactions.find(tx => {
                    if (tx.inMessage?.info.type !== 'internal') return false;
                    if (!tx.inMessage?.info.dest?.equals(gameManager.address)) return false;
                    try {
                        const body = tx.inMessage?.body?.beginParse();
                        if (!body) return false;
                        const op = body.loadUint(32);
                        return op === Opcodes.OP_FORWARD_MINT_REQUEST;
                    } catch {
                        return false;
                    }
                });

                expect(mintTx).toBeDefined();
                
                // Parse the message to verify receiver is user
                const body = mintTx!.inMessage?.body?.beginParse();
                const op = body!.loadUint(32);
                expect(op).toBe(Opcodes.OP_FORWARD_MINT_REQUEST);
                const receiver = body!.loadAddress();
                expect(receiver).toEqualAddress(userAccount.address);
                const amount = body!.loadCoins();
                expect(amount).toBe(DEFAULT_MINT_AMOUNT);
            }
        }

        // With 5% chance, running 100 tries gives >99.4% probability of at least one win
        expect(winOccurred).toBe(true);
    });

    it('should successfully mint jettons through GameManager when winning', async () => {
        // First ensure user has no jettons
        // Then run TryLuck until we get a win
        // Check that jettons were minted to user
        
        let initialUserBalance = 0n;
        try {
            initialUserBalance = await userJettonWallet.getJettonBalance();
        } catch {
            // Wallet not deployed yet, balance is 0
        }

        let winOccurred = false;
        
        for (let i = 0; i < 100 && !winOccurred; i++) {
            const messageResult = await ssm.sendTryLuck(
                userAccount.getSender(),
                TRY_LUCK_REQUIRED_AMOUNT + toNano('0.5'),
                BigInt(i)
            );

            // Check if mint request was sent to GameManager and succeeded
            const hasMintRequest = messageResult.transactions.some(tx => {
                if (tx.inMessage?.info.type !== 'internal') return false;
                if (!tx.inMessage?.info.dest?.equals(gameManager.address)) return false;
                try {
                    const body = tx.inMessage?.body?.beginParse();
                    if (!body) return false;
                    const op = body.loadUint(32);
                    return op === Opcodes.OP_FORWARD_MINT_REQUEST;
                } catch {
                    return false;
                }
            });

            if (hasMintRequest) {
                winOccurred = true;
                
                // Verify jettons were minted
                // The mint flow goes: SSM -> GM -> JettonMinter -> UserJettonWallet
                const hasMintToJettonMinter = messageResult.transactions.some(tx =>
                    tx.inMessage?.info.type === 'internal' &&
                    tx.inMessage?.info.dest?.equals(jettonMinter.address)
                );
                expect(hasMintToJettonMinter).toBe(true);
            }
        }

        expect(winOccurred).toBe(true);
    });
});
