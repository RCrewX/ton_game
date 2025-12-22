import { toNano, beginCell, Address, Cell } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { GameManager } from '../wrappers/game_manager/GameManager';
import { Game } from '../wrappers/game/Game';
import { Ship } from '../wrappers/game/Ship';
import { JettonMinter, jettonContentToCell } from '../wrappers/jetton/JettonMinter';
import { JettonWallet } from '../wrappers/jetton/JettonWallet';
import { Subcontract } from '../wrappers/subcontract/Subcontract';
import { GAS_COST_SET_JETTON_MINTER_ADDRESS, GAS_COST_SET_GAMES, GAS_COST_REDIRECT_MESSAGE } from '../wrappers/game_manager/types';
import * as dotenv from 'dotenv';
import { WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { keyPairFromSecretKey } from '@ton/crypto';
import { WalletIdV5R1 } from '@ton/ton/dist/wallets/WalletContractV5R1';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

// Load environment variables
dotenv.config();

// API timeout in milliseconds (30 seconds)
const API_TIMEOUT = 30000;
const TRANSACTION_WAIT_TIME = 5000; // 5 seconds between transactions

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

async function isContractDeployed(provider: NetworkProvider, address: Address): Promise<boolean> {
    try {
        const state = await withTimeout(
            provider.provider(address).getState(),
            API_TIMEOUT,
            `Checking deployment status for ${address.toString()}`
        );
        return state.state.type === 'active';
    } catch (error) {
        console.warn(`Could not check deployment status for ${address.toString()}:`, (error as Error).message);
        return false;
    }
}

async function checkAndDeploy(
    provider: NetworkProvider,
    contract: any,
    contractName: string,
    address: Address,
    deployFn: () => Promise<void>
): Promise<void> {
    const isDeployed = await isContractDeployed(provider, address);
    if (isDeployed) {
        console.log(`${contractName} is already deployed at ${address.toString()}`);
        return;
    }
    
    console.log(`Deploying ${contractName}...`);
    await withTimeout(deployFn(), API_TIMEOUT, `Deploying ${contractName}`);
    await provider.waitForDeploy(address);
    await sleep(TRANSACTION_WAIT_TIME); // Wait for transaction to be processed
    console.log(`${contractName} deployed successfully`);
}

async function checkAndSetJettonMinter(
    provider: NetworkProvider,
    gameManager: any,
    jettonMinter: Address,
    jettonWalletCode: any,
    contractName: string
): Promise<boolean> {
    try {
        const currentAddress = await withTimeout(
            gameManager.getJettonMinterAddress(),
            API_TIMEOUT,
            `Getting ${contractName} jetton minter address`
        );
        
        if (currentAddress && Address.isAddress(currentAddress) && currentAddress.equals(jettonMinter)) {
            console.log(`${contractName} jetton minter address is already set`);
            return false; // Already set, no need to send transaction
        }
        
        console.log(`Setting ${contractName} jetton minter address...`);
        await withTimeout(
            gameManager.sendSetJettonMinterAddress(
                provider.sender(),
                GAS_COST_SET_JETTON_MINTER_ADDRESS,
                jettonMinter,
                jettonWalletCode
            ),
            API_TIMEOUT,
            `Setting ${contractName} jetton minter address`
        );
        await sleep(TRANSACTION_WAIT_TIME);
        console.log(`${contractName} jetton minter address set`);
        return true;
    } catch (error) {
        console.error(`Error setting ${contractName} jetton minter address:`, (error as Error).message);
        throw error;
    }
}

async function checkAndSetGames(
    provider: NetworkProvider,
    gameManager: any,
    game: Address,
    contractName: string
): Promise<boolean> {
    try {
        const games = await withTimeout(
            gameManager.getGames(),
            API_TIMEOUT,
            `Getting ${contractName} games`
        );
        
        if (games instanceof Cell) {
            const currentGameAddress = games.beginParse().loadAddress();
            if (currentGameAddress && Address.isAddress(currentGameAddress) && currentGameAddress.equals(game)) {
                console.log(`${contractName} game address is already set`);
                return false; // Already set, no need to send transaction
            }
        }
        
        console.log(`Setting ${contractName} game address...`);
        await withTimeout(
            gameManager.sendSetGames(
                provider.sender(),
                GAS_COST_SET_GAMES,
                beginCell().storeAddress(game).endCell()
            ),
            API_TIMEOUT,
            `Setting ${contractName} game address`
        );
        await sleep(TRANSACTION_WAIT_TIME);
        console.log(`${contractName} game address set`);
        return true;
    } catch (error) {
        console.error(`Error setting ${contractName} game address:`, (error as Error).message);
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
            async () => await gameManager.sendDeploy(provider.sender(), toNano('0.5'))
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
            async () => await game.sendDeploy(provider.sender(), toNano('0.5'))
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
            async () => await jettonMinter.sendDeploy(provider.sender(), toNano('0.5'))
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
            async () => await ownerJettonWallet.sendDeploy(provider.sender(), toNano('0.5'))
        );
        
        deploymentData.ownerJettonWallet = formatAddress(ownerJettonWallet.address, isTestnet);
        console.log('Owner JettonWallet (bounceable):', deploymentData.ownerJettonWallet.bounceable);
        console.log('Owner JettonWallet (non-bounceable):', deploymentData.ownerJettonWallet.nonBounceable);
        saveBuildFile(deploymentData, buildFilePath);

        // Set jetton minter address in GameManager (with check)
        await checkAndSetJettonMinter(provider, gameManager, jettonMinter.address, jettonWalletCode, 'GameManager');

        // Set game address in game manager (with check)
        await checkAndSetGames(provider, gameManager, game.address, 'GameManager');

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

        // Retry getting game address with a small delay if needed
        let games = await withTimeout(
            gameManager.getGames(),
            API_TIMEOUT,
            'Getting GameManager games'
        );
        let gameAddress = games instanceof Cell ? games.beginParse().loadAddress() : null;
        let gameRetries = 5;
        while ((!gameAddress || !gameAddress.equals(game.address)) && gameRetries > 0) {
            console.log(`Waiting for game address to be set (${gameRetries} retries left)...`);
            console.log(`  Expected: ${game.address.toString()}`);
            console.log(`  Current: ${gameAddress?.toString() || 'null'}`);
            await sleep(TRANSACTION_WAIT_TIME);
            games = await withTimeout(
                gameManager.getGames(),
                API_TIMEOUT,
                'Getting GameManager games (retry)'
            );
            gameAddress = games instanceof Cell ? games.beginParse().loadAddress() : null;
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
            async () => await ownerShip.sendDeploy(provider.sender(), toNano('0.5'))
        );
        
        deploymentData.ownerShip = formatAddress(ownerShip.address, isTestnet);
        console.log('Owner Ship (bounceable):', deploymentData.ownerShip.bounceable);
        console.log('Owner Ship (non-bounceable):', deploymentData.ownerShip.nonBounceable);
        saveBuildFile(deploymentData, buildFilePath);

        // Deploy Ship Station (Subcontract with id=1)
        const shipStation = provider.open(
            Subcontract.createFromConfig(
                {
                    ownerAddress: ownerAddress,
                    id: 1n,
                },
                subcontractCode
            )
        );

        await checkAndDeploy(
            provider,
            shipStation,
            'Ship Station',
            shipStation.address,
            async () => await shipStation.sendDeploy(provider.sender(), toNano('0.5'))
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
        console.log('GameManager (bounceable):', deploymentData.gameManager!.bounceable);
        console.log('GameManager (non-bounceable):', deploymentData.gameManager!.nonBounceable);
        console.log('Game (bounceable):', deploymentData.game!.bounceable);
        console.log('Game (non-bounceable):', deploymentData.game!.nonBounceable);
        console.log('JettonMinter (bounceable):', deploymentData.jettonMinter!.bounceable);
        console.log('JettonMinter (non-bounceable):', deploymentData.jettonMinter!.nonBounceable);
        console.log('Owner JettonWallet (bounceable):', deploymentData.ownerJettonWallet!.bounceable);
        console.log('Owner JettonWallet (non-bounceable):', deploymentData.ownerJettonWallet!.nonBounceable);
        console.log('Owner Ship (bounceable):', deploymentData.ownerShip!.bounceable);
        console.log('Owner Ship (non-bounceable):', deploymentData.ownerShip!.nonBounceable);
        console.log('Ship Station (bounceable):', deploymentData.ship_station!.bounceable);
        console.log('Ship Station (non-bounceable):', deploymentData.ship_station!.nonBounceable);
        console.log('Owner jetton balance:', deploymentData.ownerJettonBalance);
        console.log(`\nBuild file saved to: ${buildFilePath}`);
        console.log('========================\n');
        console.error(`Default build file saved to: ${getDefaultBuildFilePath()}`);
        console.error('========================\n');
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
