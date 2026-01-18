import { toNano, beginCell, Address, Cell, SendMode } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { GameManager } from '../wrappers/game_manager/GameManager';
import { Game } from '../wrappers/ton_race_game/Game';
import { Ship } from '../wrappers/ton_race_game/Ship';
import { JettonMinter, jettonContentToCell } from '../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../wrappers/jetton/JettonWallet';
import { Subcontract } from '../wrappers/subcontract/Subcontract';
import { GAS_COST_DEPLOY_JETTON, GAS_COST_SET_GAMES_INFO, GAS_COST_REDIRECT_MESSAGE } from '../wrappers/game_manager/types';
import * as dotenv from 'dotenv';
import { WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { keyPairFromSecretKey } from '@ton/crypto';
import { WalletIdV5R1 } from '@ton/ton/dist/wallets/WalletContractV5R1';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { GAS_COST_MANUAL_DEPLOY } from '../wrappers/subcontract/types';
import { BASIC_STORAGE_TAX } from '../wrappers/ton_race_game/types';

// Load environment variables
dotenv.config();

// API timeout in milliseconds (30 seconds for regular operations, longer for deployment)
const API_TIMEOUT = 30000;
const DEPLOYMENT_TIMEOUT = 120000; // 120 seconds for deployment operations (increased for slow networks)
const VERIFICATION_TIMEOUT = 120000; // 120 seconds for verification after timeout
const TRANSACTION_WAIT_TIME = 5000; // 5 seconds between transactions
const RETRY_DELAY = 10000; // 10 seconds base delay before retry (exponential backoff)

interface DeploymentData {
    timestamp: string;
    network: 'testnet' | 'mainnet';
    ownerAddress: {
        bounceable: string;
        nonBounceable: string;
    };
    gameManager?: {
        bounceable: string;
        nonBounceable: string;
    };
    game?: {
        bounceable: string;
        nonBounceable: string;
    };
    jettonMinter?: {
        bounceable: string;
        nonBounceable: string;
    };
    ownerJettonWallet?: {
        bounceable: string;
        nonBounceable: string;
    };
    ownerShip?: {
        bounceable: string;
        nonBounceable: string;
    };
    ship_station?: {
        bounceable: string;
        nonBounceable: string;
    };
    ownerJettonBalance?: string;
    contractCodes?: {
        gameManager: {
            hex: string;
            hash: string;
            hashBase64: string;
        };
        game: {
            hex: string;
            hash: string;
            hashBase64: string;
        };
        ship: {
            hex: string;
            hash: string;
            hashBase64: string;
        };
        coordinateCell: {
            hex: string;
            hash: string;
            hashBase64: string;
        };
        jettonWallet: {
            hex: string;
            hash: string;
            hashBase64: string;
        };
        jettonMinter: {
            hex: string;
            hash: string;
            hashBase64: string;
        };
        subcontract: {
            hex: string;
            hash: string;
            hashBase64: string;
        };
    };
    status: 'in_progress' | 'completed' | 'failed';
    error?: string;
}

function formatAddress(address: Address, isTestnet: boolean): { bounceable: string; nonBounceable: string } {
    return {
        bounceable: address.toString({ 
            bounceable: true, 
            urlSafe: true,
            testOnly: isTestnet 
        }),
        nonBounceable: address.toString({ 
            bounceable: false, 
            urlSafe: true,
            testOnly: isTestnet 
        })
    };
}

function saveBuildFile(data: DeploymentData, filePath: string) {
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getContractCodeData(code: Cell): { hex: string; hash: string; hashBase64: string } {
    const boc = code.toBoc();
    const hex = boc.toString('hex');
    const hash = createHash('sha256').update(boc).digest('hex');
    const hashBase64 = createHash('sha256').update(boc).digest('base64');
    return { hex, hash, hashBase64 };
}

function getBuildFilePath(network: 'testnet' | 'mainnet'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `deployment-${network}-${timestamp}.json`;
    const buildDir = join(process.cwd(), 'build_info');
    if (!existsSync(buildDir)) {
        mkdirSync(buildDir, { recursive: true });
    }
    return join(buildDir, filename);
}

function getDefaultBuildFilePath(): string {
    const buildDir = join(process.cwd(), 'build_info');
    if (!existsSync(buildDir)) {
        mkdirSync(buildDir, { recursive: true });
    }
    return join(buildDir, 'deployment.json');
}

function getNetworkFromProvider(provider: NetworkProvider): 'testnet' | 'mainnet' {
    // Try to detect network from provider
    // Check various possible properties
    const providerAny = provider as any;
    const networkStr = 
        providerAny.network?.() || 
        providerAny.api?.endpoint || 
        providerAny.api?.baseURL ||
        process.env.TON_NETWORK ||
        '';
    
    const networkLower = networkStr.toLowerCase();
    if (networkLower.includes('testnet') || networkLower.includes('test') || networkLower.includes('sandbox')) {
        return 'testnet';
    }
    // Default to mainnet if not clearly testnet
    return 'mainnet';
}

function parseId(): bigint {
    const args = process.argv.slice(2);
    const idIndex = args.indexOf('--id');
    if (idIndex !== -1 && idIndex + 1 < args.length) {
        const idValue = args[idIndex + 1];
        const parsed = BigInt(idValue);
        if (parsed < 1n) {
            throw new Error('--id must be >= 1');
        }
        return parsed;
    }
    return 1n; // Default to 1
}

function loadOwnerPublicKey(): bigint {
    // First, try to use OWNER_PUBLIC_KEY if explicitly set
    const pk = (process.env.OWNER_PUBLIC_KEY || '').trim();
    if (pk) {
        const clean = pk.startsWith('0x') ? pk.slice(2) : pk;
        if (clean.length !== 64) {
            console.warn(`⚠️  OWNER_PUBLIC_KEY length invalid (${clean.length}); expected 64 hex chars. Trying to derive from PRIVATE_KEY...`);
        } else {
            const publicKey = BigInt('0x' + clean);
            console.log(`✓ Using OWNER_PUBLIC_KEY from env: ${publicKey.toString()}`);
            return publicKey;
        }
    }

    // If OWNER_PUBLIC_KEY not set or invalid, try to derive from PRIVATE_KEY
    const privateKeyHex = (process.env.PRIVATE_KEY || '').trim();
    if (privateKeyHex) {
        try {
            const cleanPrivateKey = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
            if (cleanPrivateKey.length !== 128) {
                console.warn(`⚠️  PRIVATE_KEY length invalid (${cleanPrivateKey.length}); expected 128 hex chars (64 bytes).`);
            } else {
                const secretKey = Buffer.from(cleanPrivateKey, 'hex');
                if (secretKey.length !== 64) {
                    console.warn(`⚠️  PRIVATE_KEY must be exactly 64 bytes, got ${secretKey.length}`);
                } else {
                    const keyPair = keyPairFromSecretKey(secretKey);
                    const publicKey = BigInt('0x' + keyPair.publicKey.toString('hex'));
                    console.log(`✓ Derived OWNER_PUBLIC_KEY from PRIVATE_KEY: ${publicKey.toString()}`);
                    console.log('  Note: This public key will be used for external message signature verification.');
                    return publicKey;
                }
            }
        } catch (error: any) {
            console.warn(`⚠️  Failed to derive public key from PRIVATE_KEY: ${error.message}`);
        }
    }

    // If neither is set or both failed, use 0 and warn
    console.warn('⚠️  OWNER_PUBLIC_KEY not set and could not derive from PRIVATE_KEY; using 0.');
    console.warn('   External signatures will not verify until a valid public key is set.');
    console.warn('   Options:');
    console.warn('   1. Set OWNER_PUBLIC_KEY to the public key (64 hex chars)');
    console.warn('   2. Set PRIVATE_KEY to derive the public key automatically (128 hex chars)');
    return 0n;
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
        )
    ]);
}

async function isContractDeployed(
    provider: NetworkProvider, 
    address: Address, 
    timeout: number = API_TIMEOUT
): Promise<boolean> {
    try {
        const state = await withTimeout(
            provider.provider(address).getState(),
            timeout,
            `Checking deployment status for ${address.toString()}`
        );
        return state.state.type === 'active';
    } catch (error) {
        const errorMsg = (error as Error).message;
        // If it's a timeout, assume not deployed and proceed (for initial checks)
        if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
            if (timeout === API_TIMEOUT) {
                console.warn(`Timeout checking deployment status for ${address.toString()}, assuming not deployed`);
            }
            return false;
        }
        console.warn(`Could not check deployment status for ${address.toString()}:`, errorMsg);
        return false;
    }
}

async function verifyDeploymentWithRetry(
    provider: NetworkProvider,
    address: Address,
    contractName: string,
    maxRetries: number = 4
): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`Verifying ${contractName} deployment (attempt ${attempt}/${maxRetries})...`);
        try {
            const isDeployed = await isContractDeployed(provider, address, VERIFICATION_TIMEOUT);
            if (isDeployed) {
                console.log(`✓ ${contractName} is confirmed deployed`);
                return true;
            }
        } catch (error) {
            const errorMsg = (error as Error).message;
            console.warn(`Verification attempt ${attempt} failed: ${errorMsg}`);
        }
        if (attempt < maxRetries) {
            // Use exponential backoff: 10s, 20s, 30s, 40s, 50s...
            const delay = RETRY_DELAY * attempt;
            console.log(`Contract not yet deployed, waiting ${delay}ms before retry...`);
            await sleep(delay);
        } else {
            console.log(`✗ ${contractName} is not deployed after ${maxRetries} verification attempts`);
        }
    }
    return false;
}

async function deployWithStateInit(
    provider: NetworkProvider,
    contract: any,
    value: bigint
): Promise<void> {
    // Blueprint's provider.open() wraps methods to automatically pass provider
    // Call sendDeploy with just via and value - Blueprint handles provider injection
    // Blueprint should also automatically include stateInit when contract has init
    await (contract as any).sendDeploy(provider.sender(), value);
}

async function checkAndDeploy(
    provider: NetworkProvider,
    contract: any,
    contractName: string,
    address: Address,
    deployFn: () => Promise<void>
): Promise<void> {
    // Try to check if already deployed, but don't fail if it times out
    let isDeployed = false;
    try {
        isDeployed = await isContractDeployed(provider, address, API_TIMEOUT * 2);
    } catch (error) {
        // Ignore timeout on initial check - we'll proceed with deployment
        console.warn(`Initial deployment check failed for ${contractName}, proceeding with deployment...`);
    }
    
    if (isDeployed) {
        console.log(`${contractName} is already deployed at ${address.toString()}`);
        return;
    }
    
    console.log(`Deploying ${contractName}...`);
    let deploymentSent = false;
    
    // Try to send deployment transaction
    try {
        await withTimeout(deployFn(), DEPLOYMENT_TIMEOUT, `Deploying ${contractName}`);
        deploymentSent = true;
        console.log(`Deployment transaction sent for ${contractName}`);
    } catch (error) {
        const errorMsg = (error as Error).message;
        // If deployment times out, the transaction might still have been sent
        // TON transactions can be sent successfully even if the API response is slow
        if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
            console.warn(`Deployment call timed out for ${contractName}. The transaction may have been sent despite the timeout.`);
            console.warn(`Waiting ${TRANSACTION_WAIT_TIME * 4}ms for transaction to propagate, then verifying...`);
            // Give more time for the transaction to propagate through the network
            await sleep(TRANSACTION_WAIT_TIME * 4);
            // Try verification with more retries and longer delays
            const isDeployedAfterTimeout = await verifyDeploymentWithRetry(provider, address, contractName, 4);
            if (isDeployedAfterTimeout) {
                console.log(`${contractName} is deployed (verified after send timeout)`);
                return;
            }
            // Check one more time after a longer wait - sometimes transactions take a while
            console.warn(`Still not deployed after initial retries. Waiting additional ${RETRY_DELAY * 2}ms and checking again...`);
            await sleep(RETRY_DELAY * 2);
            const finalCheck = await isContractDeployed(provider, address, VERIFICATION_TIMEOUT);
            if (finalCheck) {
                console.log(`${contractName} is deployed (verified after extended wait)`);
                return;
            }
            // If still not deployed after many retries, assume transaction wasn't sent
            // But give a helpful error message
            throw new Error(
                `${contractName} deployment transaction timed out and contract is not deployed after verification. ` +
                `This could mean:\n` +
                `  1. The transaction was not sent (network/API issue)\n` +
                `  2. The transaction is still pending in mempool (check manually later)\n` +
                `  3. The network is extremely slow (try again later)\n` +
                `Check the contract address manually: ${address.toString()}`
            );
        }
        throw error;
    }
    
    // Wait for deployment confirmation
    if (deploymentSent) {
        try {
            await withTimeout(
                provider.waitForDeploy(address),
                DEPLOYMENT_TIMEOUT,
                `Waiting for ${contractName} deployment`
            );
            console.log(`${contractName} deployment confirmed`);
        } catch (error) {
            const errorMsg = (error as Error).message;
            // If waitForDeploy times out, verify manually with retries
            if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
                console.warn(`waitForDeploy timed out for ${contractName}, verifying deployment manually with extended retries...`);
                const isDeployed = await verifyDeploymentWithRetry(provider, address, contractName, 4);
                if (!isDeployed) {
                    // One final check after extended wait
                    console.warn(`Still not deployed after retries. Waiting additional ${RETRY_DELAY * 2}ms and checking again...`);
                    await sleep(RETRY_DELAY * 2);
                    const finalCheck = await isContractDeployed(provider, address, VERIFICATION_TIMEOUT);
                    if (finalCheck) {
                        console.log(`${contractName} is deployed (verified after extended wait)`);
                    } else {
                        throw new Error(
                            `${contractName} deployment verification failed after multiple retries. ` +
                            `The transaction was sent but contract is not yet active. ` +
                            `This could mean the transaction is still processing. ` +
                            `Check manually later: ${address.toString()}`
                        );
                    }
                } else {
                    console.log(`${contractName} is deployed (verified after waitForDeploy timeout with retries)`);
                }
            } else {
                throw error;
            }
        }
    }
    
    await sleep(TRANSACTION_WAIT_TIME); // Wait for transaction to be processed
    console.log(`${contractName} deployed successfully`);
}

async function checkAndDeployJetton(
    provider: NetworkProvider,
    gameManager: any,
    jettonMinterCode: Cell,
    jettonWalletCode: Cell,
    jettonMinter: Address,
    contractName: string
): Promise<boolean> {
    try {
        const jettonInfo = await withTimeout(
            gameManager.getJettonInfo(),
            API_TIMEOUT,
            `Getting ${contractName} jetton info`
        ) as { jettonMinterAddress: Address; jettonWalletCode: Cell } | null;
        
        if (jettonInfo && jettonInfo.jettonMinterAddress && jettonInfo.jettonMinterAddress.equals(jettonMinter)) {
            console.log(`${contractName} jetton is already deployed`);
            return false; // Already deployed, no need to send transaction
        }
        
        if (jettonInfo) {
            console.log(`${contractName} jetton is already deployed with different address`);
            return false; // Cannot redeploy
        }
        
        console.log(`Deploying ${contractName} jetton...`);
        const jettonContent = jettonContentToCell({ type: 1, uri: process.env.JETTON_CONTENT_URI || 'https://example.com/jetton.json' });
        
        await withTimeout(
            gameManager.sendDeployJetton(
                provider.sender(),
                GAS_COST_DEPLOY_JETTON + toNano('0.1'),
                {
                    jettonMinterCode,
                    jettonWalletCode,
                    jettonContent,
                }
            ),
            DEPLOYMENT_TIMEOUT,
            `Deploying ${contractName} jetton`
        );
        await sleep(TRANSACTION_WAIT_TIME);
        console.log(`${contractName} jetton deployed`);
        return true;
    } catch (error) {
        console.error(`Error deploying ${contractName} jetton:`, (error as Error).message);
        throw error;
    }
}

async function checkAndSetGamesInfo(
    provider: NetworkProvider,
    gameManager: any,
    game: Address,
    contractName: string
): Promise<boolean> {
    try {
        const gamesInfo = await withTimeout(
            gameManager.getGamesInfo(),
            API_TIMEOUT,
            `Getting ${contractName} games info`
        ) as { active_game: Address; all_games: Cell } | null;
        
        if (gamesInfo?.active_game && gamesInfo.active_game.equals(game)) {
            console.log(`${contractName} game address is already set`);
            return false; // Already set, no need to send transaction
        }
        
        console.log(`Setting ${contractName} games info...`);
        const allGamesCell = beginCell()
            .storeUint(1, 2) // mode 1
            .storeAddress(game) // active_game
            .storeUint(0, 2) // mode 0 (end)
            .endCell();
        
        const gamesInfoData = {
            active_game: game,
            all_games: allGamesCell,
        };
        
        // Wait for previous transactions to be confirmed before sending
        await sleep(TRANSACTION_WAIT_TIME);
        
        // Retry logic for seqno mismatches
        const maxRetries = 3;
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await withTimeout(
                    gameManager.sendSetGamesInfo(
                        provider.sender(),
                        GAS_COST_SET_GAMES_INFO,
                        gamesInfoData
                    ),
                    API_TIMEOUT,
                    `Setting ${contractName} games info (attempt ${attempt}/${maxRetries})`
                );
                await sleep(TRANSACTION_WAIT_TIME);
                console.log(`${contractName} games info set`);
                return true;
            } catch (error) {
                lastError = error as Error;
                const errorMsg = lastError.message;
                
                // Check if it's a seqno mismatch error
                if (errorMsg.includes('Too old seqno') || errorMsg.includes('seqno')) {
                    if (attempt < maxRetries) {
                        const delay = RETRY_DELAY * attempt;
                        console.warn(`Seqno mismatch on attempt ${attempt}, waiting ${delay}ms before retry...`);
                        await sleep(delay);
                        continue;
                    }
                }
                
                // If it's not a seqno error or we've exhausted retries, throw
                throw error;
            }
        }
        
        // If we get here, all retries failed
        throw lastError || new Error(`Failed to set ${contractName} games info after ${maxRetries} attempts`);
    } catch (error) {
        console.error(`Error setting ${contractName} games info:`, (error as Error).message);
        throw error;
    }
}

export async function run(provider: NetworkProvider) {
    const network = getNetworkFromProvider(provider);
    const buildFilePath = getBuildFilePath(network);
    const isTestnet = network === 'testnet';

    // Initialize deployment data
    const deploymentData: DeploymentData = {
        timestamp: new Date().toISOString(),
        network,
        ownerAddress: { bounceable: '', nonBounceable: '' },
        status: 'in_progress'
    };

    try {
        // Get owner address from the wallet (for contract configuration)
        const ownerAddress = provider.sender().address!;
        deploymentData.ownerAddress = formatAddress(ownerAddress, isTestnet);
        console.log('Owner address (bounceable):', deploymentData.ownerAddress.bounceable);
        console.log('Owner address (non-bounceable):', deploymentData.ownerAddress.nonBounceable);
        console.log('Using native blueprint provider sender');
        console.log(`Network: ${network}`);
        saveBuildFile(deploymentData, buildFilePath);

        // Compile all contracts
        console.log('Compiling contracts...');
        const gameManagerCode = await compile('GameManager');
        const gameCode = await compile('Game');
        const shipCode = await compile('Ship');
        const coordinateCellCode = await compile('CoordinateCell');
        const jettonWalletCode = await compile('JettonWallet');
        const jettonMinterCode = await compile('JettonMinter');
        const subcontractCode = await compile('Subcontract');
        console.log('Contracts compiled successfully');

        // Store contract codes with full data (hex, hash, hashBase64)
        deploymentData.contractCodes = {
            gameManager: getContractCodeData(gameManagerCode),
            game: getContractCodeData(gameCode),
            ship: getContractCodeData(shipCode),
            coordinateCell: getContractCodeData(coordinateCellCode),
            jettonWallet: getContractCodeData(jettonWalletCode),
            jettonMinter: getContractCodeData(jettonMinterCode),
            subcontract: getContractCodeData(subcontractCode),
        };
        saveBuildFile(deploymentData, buildFilePath);
        console.log('Contract codes saved to deployment data');

        // Deploy GameManager first
        const gameManager = provider.open(
            GameManager.createFromConfig(
                {
                    ownerAddress: ownerAddress,
                },
                gameManagerCode
            )
        );

        await checkAndDeploy(
            provider,
            gameManager,
            'GameManager',
            gameManager.address,
            async () => await deployWithStateInit(provider, gameManager, toNano('1'))
        );
        
        deploymentData.gameManager = formatAddress(gameManager.address, isTestnet);
        console.log('GameManager (bounceable):', deploymentData.gameManager.bounceable);
        console.log('GameManager (non-bounceable):', deploymentData.gameManager.nonBounceable);
        saveBuildFile(deploymentData, buildFilePath);

        // Deploy Game with GameManager as manager
        const game = provider.open(
            Game.createFromConfig(
                {
                    managerAddress: gameManager.address,
                    shipCode,
                    coordinateCellCode,
                },
                gameCode
            )
        );

        await checkAndDeploy(
            provider,
            game,
            'Game',
            game.address,
            async () => await deployWithStateInit(provider, game, toNano('0.5'))
        );
        
        deploymentData.game = formatAddress(game.address, isTestnet);
        console.log('Game (bounceable):', deploymentData.game.bounceable);
        console.log('Game (non-bounceable):', deploymentData.game.nonBounceable);
        saveBuildFile(deploymentData, buildFilePath);

        // Deploy JettonMinter
        // Get jetton content URI from .env or use default
        const jettonContentUri = process.env.JETTON_CONTENT_URI || 'https://example.com/jetton.json';
        console.log(`Using jetton content URI: ${jettonContentUri}`);
        
        const jettonMinter = provider.open(
            JettonMinter.createFromConfig(
                {
                    admin: gameManager.address,
                    content: jettonContentToCell({ type: 1, uri: jettonContentUri }),
                    wallet_code: jettonWalletCode,
                },
                jettonMinterCode
            )
        );

        await checkAndDeploy(
            provider,
            jettonMinter,
            'JettonMinter',
            jettonMinter.address,
            async () => await deployWithStateInit(provider, jettonMinter, toNano('0.5'))
        );
        
        deploymentData.jettonMinter = formatAddress(jettonMinter.address, isTestnet);
        console.log('JettonMinter (bounceable):', deploymentData.jettonMinter.bounceable);
        console.log('JettonMinter (non-bounceable):', deploymentData.jettonMinter.nonBounceable);
        saveBuildFile(deploymentData, buildFilePath);

        // Deploy owner's JettonWallet
        const ownerJettonWallet = provider.open(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: ownerAddress,
                    minterAddress: jettonMinter.address,
                },
                jettonWalletCode
            )
        );

        await checkAndDeploy(
            provider,
            ownerJettonWallet,
            'Owner JettonWallet',
            ownerJettonWallet.address,
            async () => await deployWithStateInit(provider, ownerJettonWallet, toNano('0.5'))
        );
        
        deploymentData.ownerJettonWallet = formatAddress(ownerJettonWallet.address, isTestnet);
        console.log('Owner JettonWallet (bounceable):', deploymentData.ownerJettonWallet.bounceable);
        console.log('Owner JettonWallet (non-bounceable):', deploymentData.ownerJettonWallet.nonBounceable);
        saveBuildFile(deploymentData, buildFilePath);

        // Deploy jetton in GameManager (with check)
        await checkAndDeployJetton(provider, gameManager, jettonMinterCode, jettonWalletCode, jettonMinter.address, 'GameManager');

        // Set games info in game manager (with check)
        await checkAndSetGamesInfo(provider, gameManager, game.address, 'GameManager');

        // Verify configurations
        console.log('Verifying configurations...');
        const minterOwnerAddress = await withTimeout(
            jettonMinter.getAdminAddress(),
            API_TIMEOUT,
            'Getting JettonMinter admin address'
        );
        if (!minterOwnerAddress.equals(gameManager.address)) {
            console.error('JettonMinter admin address mismatch:');
            console.error(`  Expected: ${gameManager.address.toString()}`);
            console.error(`  Got: ${minterOwnerAddress.toString()}`);
            throw new Error(`JettonMinter admin address mismatch. Expected: ${gameManager.address.toString()}, Got: ${minterOwnerAddress.toString()}`);
        }
        console.log('✓ JettonMinter admin address verified');

        // Retry getting jetton minter address with a small delay if needed
        let jettonMinterAddress = await withTimeout(
            gameManager.getJettonMinterAddress(),
            API_TIMEOUT,
            'Getting GameManager jetton minter address'
        );
        let jettonRetries = 5;
        while ((!jettonMinterAddress || !jettonMinterAddress.equals(jettonMinter.address)) && jettonRetries > 0) {
            console.log(`Waiting for jetton minter address to be set (${jettonRetries} retries left)...`);
            console.log(`  Expected: ${jettonMinter.address.toString()}`);
            console.log(`  Current: ${jettonMinterAddress?.toString() || 'null'}`);
            await sleep(TRANSACTION_WAIT_TIME);
            jettonMinterAddress = await withTimeout(
                gameManager.getJettonMinterAddress(),
                API_TIMEOUT,
                'Getting GameManager jetton minter address (retry)'
            );
            jettonRetries--;
        }
        
        if (!jettonMinterAddress || !jettonMinterAddress.equals(jettonMinter.address)) {
            console.error('GameManager jetton minter address mismatch:');
            console.error(`  Expected: ${jettonMinter.address.toString()}`);
            console.error(`  Got: ${jettonMinterAddress?.toString() || 'null'}`);
            throw new Error(`GameManager jetton minter address mismatch. Expected: ${jettonMinter.address.toString()}, Got: ${jettonMinterAddress?.toString() || 'null'}`);
        }
        console.log('✓ GameManager jetton minter address verified');

        // Retry getting games info with a small delay if needed
        let gamesInfo = await withTimeout(
            gameManager.getGamesInfo(),
            API_TIMEOUT,
            'Getting GameManager games info'
        );
        let gameAddress = gamesInfo?.active_game || null;
        let gameRetries = 5;
        while ((!gameAddress || !gameAddress.equals(game.address)) && gameRetries > 0) {
            console.log(`Waiting for game address to be set (${gameRetries} retries left)...`);
            console.log(`  Expected: ${game.address.toString()}`);
            console.log(`  Current: ${gameAddress?.toString() || 'null'}`);
            await sleep(TRANSACTION_WAIT_TIME);
            gamesInfo = await withTimeout(
                gameManager.getGamesInfo(),
                API_TIMEOUT,
                'Getting GameManager games info (retry)'
            );
            gameAddress = gamesInfo?.active_game || null;
            gameRetries--;
        }
        
        if (!gameAddress || !gameAddress.equals(game.address)) {
            throw new Error(`GameManager game address mismatch. Expected: ${game.address.toString()}, Got: ${gameAddress?.toString() || 'null'}`);
        }
        console.log('✓ GameManager game address verified');

        // Check if jettons need to be minted
        const currentBalance = await withTimeout(
            ownerJettonWallet.getJettonBalance(),
            API_TIMEOUT,
            'Getting owner jetton balance'
        );
        const mintAmount = toNano('1000');
        
        let userBalance: bigint;
        
        if (currentBalance >= mintAmount) {
            console.log('Initial jettons already minted (balance:', currentBalance.toString(), ')');
            userBalance = currentBalance;
        } else {
            // Mint jettons through redirecting mint message to game manager
            console.log('Minting initial jettons...');
            const redirectMessage = JettonMinter.mintMessage(
                jettonMinter.address,
                ownerAddress,
                mintAmount,
                toNano('0.1'),
                toNano('0.2')
            );
            await withTimeout(
                gameManager.sendRedirectMessage(
                    provider.sender(),
                    toNano(1),
                    jettonMinter.address,
                    redirectMessage,
                    toNano('0.1')
                ),
                API_TIMEOUT,
                'Minting initial jettons'
            );
            console.log('Mint transaction sent, waiting for jettons to arrive...');
            
            // Wait and retry checking balance - minting can take time through the redirect chain
            userBalance = await withTimeout(
                ownerJettonWallet.getJettonBalance(),
                API_TIMEOUT,
                'Getting jetton balance after mint'
            );
            let balanceRetries = 10; // More retries for minting as it goes through multiple contracts
            while (userBalance < mintAmount && balanceRetries > 0) {
                console.log(`Waiting for jettons to arrive (${balanceRetries} retries left, current balance: ${userBalance.toString()})...`);
                await sleep(TRANSACTION_WAIT_TIME);
                userBalance = await withTimeout(
                    ownerJettonWallet.getJettonBalance(),
                    API_TIMEOUT,
                    'Getting jetton balance (retry)'
                );
                balanceRetries--;
            }
            
            if (userBalance < mintAmount) {
                console.warn(`Warning: Expected balance of at least ${mintAmount.toString()}, but got ${userBalance.toString()}. The mint transaction may still be processing.`);
            } else {
                console.log('Initial jettons minted successfully');
            }
        }

        // Save final balance
        deploymentData.ownerJettonBalance = userBalance.toString();
        console.log('Owner jetton balance:', userBalance.toString());
        saveBuildFile(deploymentData, buildFilePath);

        // Deploy Ship
        const ownerShip = provider.open(
            Ship.createFromConfig(
                {
                    userAddress: ownerAddress,
                    gameAddress: game.address,
                    coordinateCellCode,
                },
                shipCode
            )
        );

        await checkAndDeploy(
            provider,
            ownerShip,
            'Owner Ship',
            ownerShip.address,
            async () => await deployWithStateInit(provider, ownerShip, toNano('0.5'))
        );
        
        deploymentData.ownerShip = formatAddress(ownerShip.address, isTestnet);
        console.log('Owner Ship (bounceable):', deploymentData.ownerShip.bounceable);
        console.log('Owner Ship (non-bounceable):', deploymentData.ownerShip.nonBounceable);
        saveBuildFile(deploymentData, buildFilePath);

        // Deploy Ship Station (Subcontract with id from --id parameter, default 1)
        const shipStationId = parseId();
        console.log(`Deploying Ship Station with id: ${shipStationId.toString()}`);
        const shipStation = provider.open(
            Subcontract.createFromConfig(
                {
                    ownerAddress: ownerAddress,
                    id: shipStationId,
                    ownerPublicKey: loadOwnerPublicKey(),
                },
                subcontractCode
            )
        );
        console.log('Ship Station Calculated Address:', shipStation.address.toString());
        // // Pop-up ship station like user does

        // const popUpAmount = toNano('1');
        // await withTimeout(
        //     provider.sender().send({
        //         to: shipStation.address,
        //         value: popUpAmount,
        //         body: beginCell().endCell(),
        //         bounce: false,
        //         sendMode: SendMode.PAY_GAS_SEPARATELY,
        //     }),
        //     API_TIMEOUT,
        //     'Popping up ship station'
        // );
        // console.log('Ship station popped up successfully');
        // await sleep(TRANSACTION_WAIT_TIME);
        // Deploy ship station like user does

        // Here we use non user way
        const deployAmount = (GAS_COST_MANUAL_DEPLOY + BASIC_STORAGE_TAX) * 2n;
        await checkAndDeploy(
            provider,
            shipStation,
            'Ship Station',
            shipStation.address,
            async () => await deployWithStateInit(provider, shipStation, deployAmount)
        );
        
        deploymentData.ship_station = formatAddress(shipStation.address, isTestnet);
        console.log('Ship Station (bounceable):', deploymentData.ship_station.bounceable);
        console.log('Ship Station (non-bounceable):', deploymentData.ship_station.nonBounceable);
        saveBuildFile(deploymentData, buildFilePath);

        deploymentData.status = 'completed';
        saveBuildFile(deploymentData, buildFilePath);
        saveBuildFile(deploymentData, getDefaultBuildFilePath());
        
        
        console.log('\n=== Deployment Summary ===');
        console.log('Network:', network);
        console.log('Owner address (bounceable):', deploymentData.ownerAddress.bounceable);
        console.log('Owner address (non-bounceable):', deploymentData.ownerAddress.nonBounceable);
        if (deploymentData.gameManager) {
            console.log('GameManager (bounceable):', deploymentData.gameManager.bounceable);
            console.log('GameManager (non-bounceable):', deploymentData.gameManager.nonBounceable);
        }
        if (deploymentData.game) {
            console.log('Game (bounceable):', deploymentData.game.bounceable);
            console.log('Game (non-bounceable):', deploymentData.game.nonBounceable);
        }
        if (deploymentData.jettonMinter) {
            console.log('JettonMinter (bounceable):', deploymentData.jettonMinter.bounceable);
            console.log('JettonMinter (non-bounceable):', deploymentData.jettonMinter.nonBounceable);
        }
        if (deploymentData.ownerJettonWallet) {
            console.log('Owner JettonWallet (bounceable):', deploymentData.ownerJettonWallet.bounceable);
            console.log('Owner JettonWallet (non-bounceable):', deploymentData.ownerJettonWallet.nonBounceable);
        }
        if (deploymentData.ownerShip) {
            console.log('Owner Ship (bounceable):', deploymentData.ownerShip.bounceable);
            console.log('Owner Ship (non-bounceable):', deploymentData.ownerShip.nonBounceable);
        }
        if (deploymentData.ship_station) {
            console.log('Ship Station (bounceable):', deploymentData.ship_station.bounceable);
            console.log('Ship Station (non-bounceable):', deploymentData.ship_station.nonBounceable);
        }
        if (deploymentData.ownerJettonBalance) {
            console.log('Owner jetton balance:', deploymentData.ownerJettonBalance);
        }
        console.log(`\nBuild file saved to: ${buildFilePath}`);
        console.log(`Default build file saved to: ${getDefaultBuildFilePath()}`);
        console.log('========================\n');
    } catch (error: any) {
        deploymentData.status = 'failed';
        deploymentData.error = error.message || String(error);
        saveBuildFile(deploymentData, buildFilePath);
        saveBuildFile(deploymentData, getDefaultBuildFilePath());
        console.error('\n=== Deployment Failed ===');
        console.error('Error:', error.message || error);
        console.error(`Build file saved to: ${buildFilePath}`);
        console.error(`Default build file saved to: ${getDefaultBuildFilePath()}`);
        console.error('========================\n');
        throw error;
    }
}
