#!/usr/bin/env ts-node
/**
 * Deploy System Script (Standalone)
 *
 * Deploys the complete game system using the unified provider_system.
 * Does NOT require Blueprint - uses TonClient directly.
 *
 * Usage:
 *   pnpm deploy                     # Deploy to testnet
 *   pnpm deploy --mainnet           # Deploy to mainnet
 *   pnpm deploy --id 5              # Deploy with ship station ID 5
 *   pnpm deploy --mainnet --id 10   # Deploy to mainnet with ID 10
 *
 * Environment:
 *   PRIVATE_KEY          - 128-hex private key (required)
 *   JETTON_CONTENT_URI   - Jetton metadata URI (optional)
 *   OWNER_PUBLIC_KEY     - Public key for external signatures (optional, derived from PRIVATE_KEY)
 */

import { toNano, beginCell, Address, Cell, SendMode, internal, external, storeMessage } from '@ton/core';
import { compile } from '@ton/blueprint';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { keyPairFromSecretKey, mnemonicToPrivateKey } from '@ton/crypto';
import * as dotenv from 'dotenv';

import { GameManager } from '../wrappers/game_manager/GameManager';
import { Game } from '../wrappers/ton_race_game/Game';
import { Ship } from '../wrappers/ton_race_game/Ship';
import { SoullessSlotMachine } from '../wrappers/soulless_slot_machine/SoullessSlotMachine';
import { JettonMinter, jettonContentToCell } from '../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../wrappers/jetton/JettonWallet';
import { Subcontract } from '../wrappers/subcontract/Subcontract';
import { GAS_COST_DEPLOY_JETTON, GAS_COST_SET_GAMES_INFO } from '../wrappers/game_manager/types';
import { GAS_COST_MANUAL_DEPLOY } from '../wrappers/subcontract/types';
import { BASIC_STORAGE_TAX } from '../wrappers/ton_race_game/types';
import {
    Network,
    NetworkDeploymentData,
    DeploymentData,
    ContractCodes,
    formatAddress,
    getContractCodeData,
    writeFullDeploymentData,
    readDeploymentData,
} from '../lib/buildOutput';
import {
    ProviderManager,
    getTonClient,
    type Network as ProviderNetwork,
} from '../provider_system';

// Load environment variables
dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const API_TIMEOUT = 30000;
const DEPLOYMENT_TIMEOUT = 120000;
const TRANSACTION_WAIT_TIME = 5000;
const RETRY_DELAY = 10000;
const BASE_MINT_AMOUNT = 5000n;

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliOptions {
    network: Network;
    shipStationId: bigint;
}

function parseCliArgs(): CliOptions {
    const args = process.argv.slice(2);
    let network: Network = 'testnet';
    let shipStationId = 1n;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--mainnet') {
            network = 'mainnet';
        } else if (arg === '--testnet') {
            network = 'testnet';
        } else if (arg === '--id' && args[i + 1]) {
            const parsed = BigInt(args[++i]);
            if (parsed < 1n) {
                throw new Error('--id must be >= 1');
            }
            shipStationId = parsed;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Deploy System - TON Game Platform Deployment

Usage:
  pnpm deploy [options]

Options:
  --testnet       Deploy to testnet (default)
  --mainnet       Deploy to mainnet
  --id <n>        Ship station ID (default: 1)
  --help, -h      Show this help

Environment Variables:
  PRIVATE_KEY          128-hex private key (required)
  MNEMONIC             24-word mnemonic (alternative to PRIVATE_KEY)
  JETTON_CONTENT_URI   Jetton metadata URI
  OWNER_PUBLIC_KEY     Public key for external signatures

Examples:
  pnpm deploy                     # Deploy to testnet
  pnpm deploy --mainnet           # Deploy to mainnet
  pnpm deploy --id 5              # Deploy with ship station ID 5
`);
            process.exit(0);
        }
    }

    // Also check SCRIPT_ID env var (for compatibility with runWithChainstack)
    const envId = process.env.SCRIPT_ID;
    if (envId) {
        const parsed = BigInt(envId);
        if (parsed >= 1n) {
            shipStationId = parsed;
        }
    }

    return { network, shipStationId };
}

// ============================================================================
// Wallet/Key Management
// ============================================================================

interface WalletInfo {
    wallet: WalletContractV4;
    keyPair: { publicKey: Buffer; secretKey: Buffer };
}

async function loadWallet(): Promise<WalletInfo> {
    const privateKeyHex = (process.env.PRIVATE_KEY || '').trim();
    const mnemonic = (process.env.MNEMONIC || '').trim();

    let keyPair: { publicKey: Buffer; secretKey: Buffer };

    if (privateKeyHex) {
        // Load from private key
        const clean = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
        if (clean.length !== 128) {
            throw new Error(`PRIVATE_KEY must be 128 hex characters (64 bytes), got ${clean.length}`);
        }
        const secretKey = Buffer.from(clean, 'hex');
        keyPair = keyPairFromSecretKey(secretKey);
        console.log('Loaded wallet from PRIVATE_KEY');
    } else if (mnemonic) {
        // Load from mnemonic
        const words = mnemonic.split(/\s+/).filter(w => w.length > 0);
        if (words.length !== 24) {
            throw new Error(`MNEMONIC must be 24 words, got ${words.length}`);
        }
        keyPair = await mnemonicToPrivateKey(words);
        console.log('Loaded wallet from MNEMONIC');
    } else {
        throw new Error('Either PRIVATE_KEY or MNEMONIC must be set in .env');
    }

    const wallet = WalletContractV4.create({
        publicKey: keyPair.publicKey,
        workchain: 0,
    });

    return { wallet, keyPair };
}

function loadOwnerPublicKey(keyPair: { publicKey: Buffer; secretKey: Buffer }): bigint {
    // First, try to use OWNER_PUBLIC_KEY if explicitly set
    const pk = (process.env.OWNER_PUBLIC_KEY || '').trim();
    if (pk) {
        const clean = pk.startsWith('0x') ? pk.slice(2) : pk;
        if (clean.length === 64) {
            const publicKey = BigInt('0x' + clean);
            console.log(`Using OWNER_PUBLIC_KEY from env`);
            return publicKey;
        }
        console.warn(`OWNER_PUBLIC_KEY invalid length (${clean.length}), deriving from wallet...`);
    }

    // Derive from wallet's key pair
    const publicKey = BigInt('0x' + keyPair.publicKey.toString('hex'));
    console.log('Using public key derived from wallet');
    return publicKey;
}

// ============================================================================
// Transaction Helpers
// ============================================================================

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
    ]);
}

async function isContractDeployed(client: TonClient, address: Address): Promise<boolean> {
    try {
        const state = await withTimeout(
            client.getContractState(address),
            API_TIMEOUT,
            `Checking deployment status for ${address.toString()}`
        );
        return state.state === 'active';
    } catch (error: any) {
        if (error.message?.includes('timeout')) {
            return false;
        }
        console.warn(`Could not check deployment status: ${error.message}`);
        return false;
    }
}

async function waitForDeploy(
    client: TonClient,
    address: Address,
    maxRetries: number = 30
): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        if (await isContractDeployed(client, address)) {
            return true;
        }
        await sleep(2000);
    }
    return false;
}

async function getSeqno(client: TonClient, walletAddress: Address): Promise<number> {
    try {
        const state = await client.getContractState(walletAddress);
        if (state.state !== 'active') {
            return 0;
        }
        const result = await client.runMethod(walletAddress, 'seqno');
        return result.stack.readNumber();
    } catch {
        return 0;
    }
}

async function sendTransaction(
    client: TonClient,
    wallet: WalletContractV4,
    keyPair: { publicKey: Buffer; secretKey: Buffer },
    to: Address,
    value: bigint,
    body?: Cell,
    stateInit?: { code: Cell; data: Cell },
    maxRetries: number = 3
): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Get fresh seqno before each attempt
            const seqno = await getSeqno(client, wallet.address);

            const transfer = wallet.createTransfer({
                seqno,
                secretKey: keyPair.secretKey,
                messages: [
                    internal({
                        to,
                        value,
                        body,
                        init: stateInit,
                        bounce: false, // Don't bounce for deployments
                    }),
                ],
            });

            await client.sendExternalMessage(wallet, transfer);
            return; // Success
        } catch (error: any) {
            lastError = error;
            const errorMsg = error.message || String(error);

            // Check if it's a retryable error
            const isRetryable =
                errorMsg.includes('500') ||
                errorMsg.includes('502') ||
                errorMsg.includes('503') ||
                errorMsg.includes('429') ||
                errorMsg.includes('timeout') ||
                errorMsg.includes('ECONNRESET') ||
                errorMsg.includes('ETIMEDOUT');

            if (isRetryable && attempt < maxRetries) {
                const delay = RETRY_DELAY * attempt; // Exponential backoff
                console.warn(`Transaction attempt ${attempt} failed: ${errorMsg}`);
                console.warn(`Retrying in ${delay / 1000}s...`);
                await sleep(delay);
                continue;
            }

            // Non-retryable error or max retries reached
            throw error;
        }
    }

    throw lastError || new Error('Transaction failed after retries');
}

async function checkAndDeploy(
    client: TonClient,
    wallet: WalletContractV4,
    keyPair: { publicKey: Buffer; secretKey: Buffer },
    contractAddress: Address,
    contractName: string,
    value: bigint,
    stateInit: { code: Cell; data: Cell }
): Promise<void> {
    // Check if already deployed
    if (await isContractDeployed(client, contractAddress)) {
        console.log(`${contractName} is already deployed at ${contractAddress.toString()}`);
        return;
    }

    console.log(`Deploying ${contractName}...`);

    // Send deployment transaction
    await withTimeout(
        sendTransaction(client, wallet, keyPair, contractAddress, value, undefined, stateInit),
        DEPLOYMENT_TIMEOUT,
        `Deploying ${contractName}`
    );

    console.log(`Deployment transaction sent for ${contractName}`);

    // Wait for deployment confirmation
    const deployed = await waitForDeploy(client, contractAddress, 30);
    if (!deployed) {
        throw new Error(`${contractName} deployment not confirmed after 60 seconds`);
    }

    console.log(`${contractName} deployed successfully`);
    await sleep(TRANSACTION_WAIT_TIME);
}

async function sendContractMessage(
    client: TonClient,
    wallet: WalletContractV4,
    keyPair: { publicKey: Buffer; secretKey: Buffer },
    to: Address,
    value: bigint,
    body: Cell
): Promise<void> {
    await sendTransaction(client, wallet, keyPair, to, value, body, undefined, 3);
}

/**
 * Wait for seqno to increment (transaction processed)
 */
async function waitForSeqnoChange(
    client: TonClient,
    walletAddress: Address,
    currentSeqno: number,
    maxWaitMs: number = 60000
): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
        try {
            const newSeqno = await getSeqno(client, walletAddress);
            if (newSeqno > currentSeqno) {
                return true;
            }
        } catch {
            // Ignore errors, keep waiting
        }
        await sleep(2000);
    }
    return false;
}

/**
 * Send a message and wait for it to be processed
 */
async function sendAndWait(
    client: TonClient,
    wallet: WalletContractV4,
    keyPair: { publicKey: Buffer; secretKey: Buffer },
    to: Address,
    value: bigint,
    body: Cell,
    operationName: string
): Promise<void> {
    const seqnoBefore = await getSeqno(client, wallet.address);

    await sendContractMessage(client, wallet, keyPair, to, value, body);
    console.log(`${operationName} transaction sent`);

    // Wait for seqno to change (transaction processed)
    const processed = await waitForSeqnoChange(client, wallet.address, seqnoBefore, 60000);
    if (!processed) {
        console.warn(`Warning: ${operationName} may not have been processed yet`);
    } else {
        console.log(`${operationName} transaction confirmed`);
    }

    // Additional wait for state propagation
    await sleep(TRANSACTION_WAIT_TIME);
}

// ============================================================================
// Address Calculation
// ============================================================================

function calculateNetworkAddresses(
    ownerAddress: Address,
    gameManagerCode: Cell,
    gameCode: Cell,
    shipCode: Cell,
    coordinateCellCode: Cell,
    ssmCode: Cell,
    jettonMinterCode: Cell,
    jettonWalletCode: Cell,
    subcontractCode: Cell,
    isTestnet: boolean,
    shipStationId: bigint,
    ownerPublicKey: bigint,
    jettonContentUri: string
): NetworkDeploymentData {
    const gameManager = GameManager.createFromConfig({ ownerAddress }, gameManagerCode);

    const game = Game.createFromConfig({
        managerAddress: gameManager.address,
        shipCode,
        coordinateCellCode,
    }, gameCode);

    const ssm = SoullessSlotMachine.createFromConfig(
        { ownerAddress: gameManager.address },
        ssmCode
    );

    const jettonMinter = JettonMinter.createFromConfig({
        admin: gameManager.address,
        content: jettonContentToCell({ type: 1, uri: jettonContentUri }),
        wallet_code: jettonWalletCode,
    }, jettonMinterCode);

    const ownerJettonWallet = JettonWallet.createFromConfig({
        ownerAddress,
        minterAddress: jettonMinter.address,
    }, jettonWalletCode);

    const ownerShip = Ship.createFromConfig({
        userAddress: ownerAddress,
        gameAddress: game.address,
        coordinateCellCode,
    }, shipCode);

    const shipStation = Subcontract.createFromConfig({
        ownerAddress,
        id: shipStationId,
        ownerPublicKey,
    }, subcontractCode);

    return {
        deployed: false,
        ownerAddress: formatAddress(ownerAddress, isTestnet),
        gameManager: formatAddress(gameManager.address, isTestnet),
        jettonMinter: formatAddress(jettonMinter.address, isTestnet),
        ownerJettonWallet: formatAddress(ownerJettonWallet.address, isTestnet),
        ship_station: formatAddress(shipStation.address, isTestnet),
        games: {
            ton_race_game: {
                game: formatAddress(game.address, isTestnet),
                ownerShip: formatAddress(ownerShip.address, isTestnet),
            },
            soulless_slot_machine: {
                ssm: formatAddress(ssm.address, isTestnet),
            },
        },
    };
}

// ============================================================================
// Main Deployment Logic
// ============================================================================

async function main(): Promise<void> {
    const options = parseCliArgs();
    const { network, shipStationId } = options;
    const isTestnet = network === 'testnet';
    const timestamp = new Date().toISOString();

    console.log('\n=== TON Game System Deployment ===');
    console.log(`Network: ${network}`);
    console.log(`Ship Station ID: ${shipStationId.toString()}`);
    console.log('');

    // Initialize provider system
    console.log('Initializing provider system...');
    const pm = ProviderManager.getInstance();
    await pm.init(network as ProviderNetwork);

    const client = await getTonClient(pm);
    const endpoint = await pm.getEndpoint();
    console.log(`Connected to: ${endpoint}`);
    console.log('');

    // Load wallet
    const { wallet, keyPair } = await loadWallet();
    const ownerAddress = wallet.address;
    const ownerPublicKey = loadOwnerPublicKey(keyPair);

    console.log('Owner address (bounceable):', ownerAddress.toString({ bounceable: true }));
    console.log('Owner address (non-bounceable):', ownerAddress.toString({ bounceable: false }));
    console.log('');

    // Check wallet balance
    const walletBalance = await client.getBalance(ownerAddress);
    console.log(`Wallet balance: ${(Number(walletBalance) / 1e9).toFixed(4)} TON`);
    if (walletBalance < toNano('1')) {
        console.error('ERROR: Wallet balance too low. Need at least 1 TON for deployment.');
        process.exit(1);
    }
    console.log('');

    // Read existing deployment data
    const existingData = readDeploymentData();

    try {
        // Compile all contracts
        console.log('Compiling contracts...');
        const gameManagerCode = await compile('GameManager');
        const gameCode = await compile('Game');
        const shipCode = await compile('Ship');
        const coordinateCellCode = await compile('CoordinateCell');
        const ssmCode = await compile('SoullessSlotMachine');
        const jettonWalletCode = await compile('JettonWallet');
        const jettonMinterCode = await compile('JettonMinter');
        const subcontractCode = await compile('Subcontract');
        console.log('Contracts compiled successfully');
        console.log('');

        const jettonContentUri = process.env.JETTON_CONTENT_URI || 'https://example.com/jetton.json';
        console.log(`Jetton content URI: ${jettonContentUri}`);

        // Build contract codes
        const contractCodes: ContractCodes = {
            gameManager: getContractCodeData(gameManagerCode),
            jettonWallet: getContractCodeData(jettonWalletCode),
            jettonMinter: getContractCodeData(jettonMinterCode),
            subcontract: getContractCodeData(subcontractCode),
            games: {
                ton_race_game: {
                    game: getContractCodeData(gameCode),
                    ship: getContractCodeData(shipCode),
                    coordinateCell: getContractCodeData(coordinateCellCode),
                },
                soulless_slot_machine: {
                    soullessSlotMachine: getContractCodeData(ssmCode),
                },
            },
        };

        // Calculate addresses for both networks
        console.log('Calculating addresses...');
        const testnetAddresses = calculateNetworkAddresses(
            ownerAddress, gameManagerCode, gameCode, shipCode, coordinateCellCode,
            ssmCode, jettonMinterCode, jettonWalletCode, subcontractCode,
            true, shipStationId, ownerPublicKey, jettonContentUri
        );
        const mainnetAddresses = calculateNetworkAddresses(
            ownerAddress, gameManagerCode, gameCode, shipCode, coordinateCellCode,
            ssmCode, jettonMinterCode, jettonWalletCode, subcontractCode,
            false, shipStationId, ownerPublicKey, jettonContentUri
        );

        // Initialize deployment data
        const deploymentData: DeploymentData = {
            timestamp,
            contractCodes,
            testnet: network === 'testnet'
                ? { ...testnetAddresses, status: 'in_progress' }
                : existingData.testnet.deployed ? existingData.testnet : testnetAddresses,
            mainnet: network === 'mainnet'
                ? { ...mainnetAddresses, status: 'in_progress' }
                : existingData.mainnet.deployed ? existingData.mainnet : mainnetAddresses,
        };

        const networkData = network === 'testnet' ? deploymentData.testnet : deploymentData.mainnet;

        writeFullDeploymentData(deploymentData);
        console.log('Initial deployment data saved');
        console.log('');

        // Create contract instances
        const gameManager = GameManager.createFromConfig({ ownerAddress }, gameManagerCode);
        const game = Game.createFromConfig({
            managerAddress: gameManager.address,
            shipCode,
            coordinateCellCode,
        }, gameCode);
        const ssm = SoullessSlotMachine.createFromConfig(
            { ownerAddress: gameManager.address },
            ssmCode
        );
        const jettonMinter = JettonMinter.createFromConfig({
            admin: gameManager.address,
            content: jettonContentToCell({ type: 1, uri: jettonContentUri }),
            wallet_code: jettonWalletCode,
        }, jettonMinterCode);
        const ownerJettonWallet = JettonWallet.createFromConfig({
            ownerAddress,
            minterAddress: jettonMinter.address,
        }, jettonWalletCode);
        const ownerShip = Ship.createFromConfig({
            userAddress: ownerAddress,
            gameAddress: game.address,
            coordinateCellCode,
        }, shipCode);
        const shipStation = Subcontract.createFromConfig({
            ownerAddress,
            id: shipStationId,
            ownerPublicKey,
        }, subcontractCode);

        // ================================================================
        // Deploy contracts
        // ================================================================

        // 1. Deploy GameManager
        await checkAndDeploy(
            client, wallet, keyPair,
            gameManager.address, 'GameManager',
            toNano('1'),
            { code: gameManagerCode, data: gameManager.init!.data }
        );
        console.log('GameManager:', gameManager.address.toString());
        writeFullDeploymentData(deploymentData);

        // 2. Deploy Game
        await checkAndDeploy(
            client, wallet, keyPair,
            game.address, 'TON Race Game',
            toNano('0.5'),
            { code: gameCode, data: game.init!.data }
        );
        console.log('TON Race Game:', game.address.toString());
        writeFullDeploymentData(deploymentData);

        // 3. Deploy SSM
        await checkAndDeploy(
            client, wallet, keyPair,
            ssm.address, 'Soulless Slot Machine',
            toNano('0.5'),
            { code: ssmCode, data: ssm.init!.data }
        );
        console.log('Soulless Slot Machine:', ssm.address.toString());
        writeFullDeploymentData(deploymentData);

        // 4. Deploy JettonMinter
        await checkAndDeploy(
            client, wallet, keyPair,
            jettonMinter.address, 'JettonMinter',
            toNano('0.5'),
            { code: jettonMinterCode, data: jettonMinter.init!.data }
        );
        console.log('JettonMinter:', jettonMinter.address.toString());
        writeFullDeploymentData(deploymentData);

        // 5. Deploy owner's JettonWallet
        await checkAndDeploy(
            client, wallet, keyPair,
            ownerJettonWallet.address, 'Owner JettonWallet',
            toNano('0.5'),
            { code: jettonWalletCode, data: ownerJettonWallet.init!.data }
        );
        console.log('Owner JettonWallet:', ownerJettonWallet.address.toString());
        writeFullDeploymentData(deploymentData);

        // 6. Configure GameManager: Deploy Jetton
        console.log('Configuring GameManager jetton...');
        const openedGameManager = client.open(gameManager);
        let jettonInfo = await openedGameManager.getJettonInfo().catch(() => null);

        if (!jettonInfo?.jettonMinterAddress?.equals(jettonMinter.address)) {
            const jettonContent = jettonContentToCell({ type: 1, uri: jettonContentUri });
            await sendAndWait(
                client, wallet, keyPair,
                gameManager.address,
                GAS_COST_DEPLOY_JETTON + toNano('0.1'),
                GameManager.deployJettonMessage({
                    jettonMinterCode,
                    jettonWalletCode,
                    jettonContent,
                }),
                'Deploy jetton'
            );
        } else {
            console.log('Jetton already configured');
        }

        // 7. Configure GameManager: Set games info
        console.log('Setting games info...');
        const gamesInfo = await openedGameManager.getGamesInfo().catch(() => null);

        if (!gamesInfo?.active_game?.equals(game.address)) {
            let allGamesBuilder = beginCell();
            for (const gameAddr of [game.address, ssm.address]) {
                allGamesBuilder = allGamesBuilder
                    .storeUint(1, 2)
                    .storeAddress(gameAddr);
            }
            allGamesBuilder = allGamesBuilder.storeUint(0, 2);

            await sendAndWait(
                client, wallet, keyPair,
                gameManager.address,
                GAS_COST_SET_GAMES_INFO,
                GameManager.setGamesInfoMessage({
                    active_game: game.address,
                    all_games: allGamesBuilder.endCell(),
                }),
                'Set games info'
            );
        } else {
            console.log('Games info already configured');
        }

        // 8. Verify configurations
        console.log('Verifying configurations...');
        await sleep(TRANSACTION_WAIT_TIME);

        const verifyJettonInfo = await openedGameManager.getJettonInfo().catch(() => null);
        if (verifyJettonInfo?.jettonMinterAddress?.equals(jettonMinter.address)) {
            console.log('✓ JettonMinter address verified');
        } else {
            console.warn('⚠ JettonMinter address not yet set (may still be processing)');
        }

        const verifyGamesInfo = await openedGameManager.getGamesInfo().catch(() => null);
        if (verifyGamesInfo?.active_game?.equals(game.address)) {
            console.log('✓ Active game address verified');
        } else {
            console.warn('⚠ Active game not yet set (may still be processing)');
        }

        // 9. Mint initial jettons
        console.log('Checking jetton balance...');
        const openedOwnerJettonWallet = client.open(ownerJettonWallet);
        let currentBalance = 0n;
        try {
            currentBalance = await openedOwnerJettonWallet.getJettonBalance();
        } catch {
            // Wallet may not be initialized yet
        }

        if (currentBalance < BASE_MINT_AMOUNT) {
            console.log('Minting initial jettons...');
            const redirectMessage = JettonMinter.mintMessage(
                jettonMinter.address,
                ownerAddress,
                BASE_MINT_AMOUNT,
                toNano('0.1'),
                toNano('0.2')
            );
            await sendAndWait(
                client, wallet, keyPair,
                gameManager.address,
                toNano('1'),
                GameManager.redirectMessage(jettonMinter.address, redirectMessage, toNano('0.1')),
                'Mint jettons'
            );

            // Check balance
            try {
                currentBalance = await openedOwnerJettonWallet.getJettonBalance();
            } catch {
                currentBalance = 0n;
            }
        }
        networkData.ownerJettonBalance = currentBalance.toString();
        console.log(`Owner jetton balance: ${currentBalance.toString()}`);
        writeFullDeploymentData(deploymentData);

        // 10. Deploy Owner Ship
        await checkAndDeploy(
            client, wallet, keyPair,
            ownerShip.address, 'Owner Ship',
            toNano('0.5'),
            { code: shipCode, data: ownerShip.init!.data }
        );
        console.log('Owner Ship:', ownerShip.address.toString());
        writeFullDeploymentData(deploymentData);

        // 11. Deploy Ship Station
        const deployAmount = (GAS_COST_MANUAL_DEPLOY + BASIC_STORAGE_TAX) * 2n;
        await checkAndDeploy(
            client, wallet, keyPair,
            shipStation.address, 'Ship Station',
            deployAmount,
            { code: subcontractCode, data: shipStation.init!.data }
        );
        console.log('Ship Station:', shipStation.address.toString());
        writeFullDeploymentData(deploymentData);

        // Mark deployment as completed
        networkData.status = 'completed';
        networkData.deployed = true;
        writeFullDeploymentData(deploymentData);

        // ================================================================
        // Summary
        // ================================================================

        console.log('\n=== Deployment Summary ===');
        console.log('Network:', network);
        console.log('');
        console.log('Owner:', ownerAddress.toString());
        console.log('GameManager:', gameManager.address.toString());
        console.log('TON Race Game:', game.address.toString());
        console.log('Soulless Slot Machine:', ssm.address.toString());
        console.log('JettonMinter:', jettonMinter.address.toString());
        console.log('Owner JettonWallet:', ownerJettonWallet.address.toString());
        console.log('Owner Ship:', ownerShip.address.toString());
        console.log('Ship Station:', shipStation.address.toString());
        console.log('Owner Jetton Balance:', currentBalance.toString());
        console.log('');
        console.log('Deployment info saved to: deployment_info/deployment_latest.json');
        console.log('========================\n');

    } catch (error: any) {
        // Update deployment data with error status
        try {
            const errorData = readDeploymentData();
            const errorNetworkData = network === 'testnet' ? errorData.testnet : errorData.mainnet;
            errorNetworkData.status = 'failed';
            errorNetworkData.error = error.message || String(error);
            errorNetworkData.deployed = false;
            writeFullDeploymentData(errorData);
        } catch {
            // Ignore errors when writing error state
        }

        console.error('\n=== Deployment Failed ===');
        console.error('Error:', error.message || error);
        console.error('========================\n');
        // Re-throw to let the bottom handler clean up and exit
        throw error;
    }
}

// Run main
main()
    .then(() => {
        // Cleanup provider system to allow process exit
        ProviderManager.resetInstance();
        process.exit(0);
    })
    .catch(() => {
        // Error already logged in main(), just cleanup and exit
        ProviderManager.resetInstance();
        process.exit(1);
    });
