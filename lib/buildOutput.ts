/**
 * Unified Build Output Utilities
 * 
 * This module provides utilities for writing build artifacts to standardized locations:
 * - gas_costs/: Gas consumption measurements from tests
 * - deployment_info/: Deployment information and contract addresses
 * 
 * Each output type follows the pattern:
 * - <name>_latest.json: Always-updated file with latest data
 * - all/<name>-<timestamp>.json: Timestamped archive of all outputs
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Address, Cell } from '@ton/core';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type Network = 'testnet' | 'mainnet';

export interface AddressInfo {
    bounceable: string;
    nonBounceable: string;
}

export interface ContractCodeInfo {
    hex: string;
    hash: string;
    hashBase64: string;
}

export interface TonRaceGameInfo {
    game: AddressInfo;
    ownerShip?: AddressInfo;
    contractCodes: {
        game: ContractCodeInfo;
        ship: ContractCodeInfo;
        coordinateCell: ContractCodeInfo;
    };
}

export interface SoullessSlotMachineInfo {
    ssm: AddressInfo;
    contractCodes: {
        soullessSlotMachine: ContractCodeInfo;
    };
}

export interface NetworkDeploymentData {
    deployed: boolean;
    timestamp?: string;
    ownerAddress?: AddressInfo;
    gameManager?: AddressInfo;
    jettonMinter?: AddressInfo;
    ownerJettonWallet?: AddressInfo;
    ship_station?: AddressInfo;
    ownerJettonBalance?: string;
    games?: {
        ton_race_game?: TonRaceGameInfo;
        soulless_slot_machine?: SoullessSlotMachineInfo;
    };
    contractCodes?: {
        gameManager: ContractCodeInfo;
        jettonWallet: ContractCodeInfo;
        jettonMinter: ContractCodeInfo;
        subcontract: ContractCodeInfo;
    };
    status?: 'in_progress' | 'completed' | 'failed';
    error?: string;
}

export interface DeploymentData {
    timestamp: string;
    testnet: NetworkDeploymentData;
    mainnet: NetworkDeploymentData;
}

export interface GasCostsData {
    timestamp: string;
    gasCosts: Record<string, string>;
}

// ============================================================================
// Folder Paths
// ============================================================================

const ROOT_DIR = process.cwd();

export function getGasCostsDir(): string {
    return join(ROOT_DIR, 'gas_costs');
}

export function getDeploymentInfoDir(): string {
    return join(ROOT_DIR, 'deployment_info');
}

function ensureDir(dir: string): void {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function ensureAllDir(baseDir: string): string {
    const allDir = join(baseDir, 'all');
    ensureDir(allDir);
    return allDir;
}

// ============================================================================
// Gas Costs Output
// ============================================================================

/**
 * Write gas costs data to the gas_costs folder.
 * Creates:
 * - gas_costs/<name>_latest.json
 * - gas_costs/all/<name>-<timestamp>.json
 * 
 * @param name - Name of the gas cost category (e.g., 'game-manager', 'subcontract')
 * @param gasCosts - Record of operation names to cost strings
 */
export function writeGasCosts(name: string, gasCosts: Record<string, string>): void {
    const timestamp = new Date().toISOString();
    const data: GasCostsData = { timestamp, gasCosts };

    const baseDir = getGasCostsDir();
    ensureDir(baseDir);
    
    const allDir = ensureAllDir(baseDir);

    // Write latest version
    const latestPath = join(baseDir, `${name}_latest.json`);
    writeFileSync(latestPath, JSON.stringify(data, null, 2), 'utf-8');

    // Write timestamped version
    const timestampStr = timestamp.replace(/[:.]/g, '-');
    const archivedPath = join(allDir, `${name}-${timestampStr}.json`);
    writeFileSync(archivedPath, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`✅ Gas costs written to ${latestPath}`);
    console.log(`   Archived to ${archivedPath}`);
}

/**
 * Read the latest gas costs for a given category.
 * 
 * @param name - Name of the gas cost category
 * @returns The gas costs data or null if not found
 */
export function readGasCosts(name: string): GasCostsData | null {
    const latestPath = join(getGasCostsDir(), `${name}_latest.json`);
    if (!existsSync(latestPath)) {
        return null;
    }
    try {
        const raw = readFileSync(latestPath, 'utf-8');
        return JSON.parse(raw) as GasCostsData;
    } catch {
        return null;
    }
}

// ============================================================================
// Deployment Info Output
// ============================================================================

/**
 * Format an Address for storage in deployment JSON.
 */
export function formatAddress(address: Address, isTestnet: boolean): AddressInfo {
    return {
        bounceable: address.toString({
            bounceable: true,
            urlSafe: true,
            testOnly: isTestnet,
        }),
        nonBounceable: address.toString({
            bounceable: false,
            urlSafe: true,
            testOnly: isTestnet,
        }),
    };
}

/**
 * Get contract code data (hex, hash, hashBase64) from a Cell.
 */
export function getContractCodeData(code: Cell): ContractCodeInfo {
    const boc = code.toBoc();
    const hex = boc.toString('hex');
    const hash = createHash('sha256').update(boc).digest('hex');
    const hashBase64 = createHash('sha256').update(boc).digest('base64');
    return { hex, hash, hashBase64 };
}

/**
 * Get the path to the latest deployment file.
 */
export function getDeploymentLatestPath(): string {
    return join(getDeploymentInfoDir(), 'deployment_latest.json');
}

/**
 * Read the current deployment data, or create empty structure if not exists.
 */
export function readDeploymentData(): DeploymentData {
    const latestPath = getDeploymentLatestPath();
    if (existsSync(latestPath)) {
        try {
            const raw = readFileSync(latestPath, 'utf-8');
            return JSON.parse(raw) as DeploymentData;
        } catch {
            // Fall through to create empty
        }
    }
    
    // Return empty structure
    return {
        timestamp: new Date().toISOString(),
        testnet: { deployed: false },
        mainnet: { deployed: false },
    };
}

/**
 * Write deployment data for a specific network.
 * Preserves data for the other network unless contract codes have changed.
 * 
 * Creates:
 * - deployment_info/deployment_latest.json
 * - deployment_info/all/deployment-<timestamp>.json
 * 
 * @param network - The network being deployed to
 * @param networkData - The deployment data for this network
 */
export function writeDeploymentData(network: Network, networkData: NetworkDeploymentData): void {
    const timestamp = new Date().toISOString();
    
    // Read existing data
    let existingData = readDeploymentData();
    
    // Check if contract codes are the same for the other network
    // If codes changed, we should NOT mark the other network as deployed
    const otherNetwork: Network = network === 'testnet' ? 'mainnet' : 'testnet';
    const otherNetworkData = existingData[otherNetwork];
    
    if (otherNetworkData.deployed && networkData.contractCodes) {
        // Compare contract code hashes
        const existingCodes = otherNetworkData.contractCodes;
        const newCodes = networkData.contractCodes;
        
        if (existingCodes) {
            const codesChanged = 
                existingCodes.gameManager?.hash !== newCodes.gameManager?.hash ||
                existingCodes.jettonMinter?.hash !== newCodes.jettonMinter?.hash ||
                existingCodes.jettonWallet?.hash !== newCodes.jettonWallet?.hash ||
                existingCodes.subcontract?.hash !== newCodes.subcontract?.hash;
            
            if (codesChanged) {
                console.log(`⚠️  Contract codes changed. ${otherNetwork} deployment status preserved but may need redeploy.`);
            }
        }
    }
    
    // Update the data for the target network
    const data: DeploymentData = {
        timestamp,
        testnet: network === 'testnet' ? networkData : existingData.testnet,
        mainnet: network === 'mainnet' ? networkData : existingData.mainnet,
    };
    
    // Ensure network timestamps
    if (network === 'testnet') {
        data.testnet.timestamp = timestamp;
    } else {
        data.mainnet.timestamp = timestamp;
    }
    
    const baseDir = getDeploymentInfoDir();
    ensureDir(baseDir);
    
    const allDir = ensureAllDir(baseDir);

    // Write latest version
    const latestPath = getDeploymentLatestPath();
    writeFileSync(latestPath, JSON.stringify(data, null, 2), 'utf-8');

    // Write timestamped version
    const timestampStr = timestamp.replace(/[:.]/g, '-');
    const archivedPath = join(allDir, `deployment-${timestampStr}.json`);
    writeFileSync(archivedPath, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`✅ Deployment info written to ${latestPath}`);
    console.log(`   Archived to ${archivedPath}`);
}

/**
 * Read deployment data for a specific network.
 * 
 * @param network - The network to read deployment data for
 * @param requireDeployed - If true, returns null only if deployed=false AND status is not 'failed'/'in_progress'.
 *                          If false, always returns the network data (even if deployed=false).
 *                          Default: false (always return the data so caller can check status).
 * @returns The network deployment data or null if no deployment attempt exists
 */
export function readNetworkDeploymentData(network: Network, requireDeployed: boolean = false): NetworkDeploymentData | null {
    const data = readDeploymentData();
    const networkData = data[network];
    
    // If requireDeployed is true, only return data if successfully deployed
    if (requireDeployed && !networkData.deployed) {
        return null;
    }
    
    // If there's a status (meaning deployment was attempted), return the data
    // so caller can check the status and error message
    if (networkData.status || networkData.timestamp) {
        return networkData;
    }
    
    // No deployment attempt exists for this network
    if (!networkData.deployed) {
        return null;
    }
    
    return networkData;
}

/**
 * Get the latest deployment file for a specific network (for backwards compatibility).
 * Returns the deployment_latest.json path.
 */
export function getLatestDeploymentFilePath(): string {
    return getDeploymentLatestPath();
}

/**
 * Check if a network has been deployed.
 */
export function isNetworkDeployed(network: Network): boolean {
    const data = readDeploymentData();
    return data[network].deployed;
}

// ============================================================================
// External Test Result Output
// ============================================================================

export interface ExternalTestGasCost {
    operation: string;
    costNano: string;
    costTon: string;
}

export interface ExternalTestResult {
    timestamp: string;
    network: string;
    uniqueId: string;
    subcontractAddress: string;
    shipAddress: string;
    extSeqno: string;
    gasCosts: ExternalTestGasCost[];
    totalCostNano: string;
    totalCostTon: string;
    success: boolean;
    error?: string;
    shipStateAfterMoves?: {
        movementInProcess: boolean;
        balance: string;
    };
}

/**
 * Write external test result to deployment_info folder.
 * Creates:
 * - deployment_info/external-test_latest.json
 * - deployment_info/all/external-test-<timestamp>.json
 */
export function writeExternalTestResult(result: ExternalTestResult): void {
    const baseDir = getDeploymentInfoDir();
    ensureDir(baseDir);
    
    const allDir = ensureAllDir(baseDir);

    // Write latest version
    const latestPath = join(baseDir, 'external-test_latest.json');
    writeFileSync(latestPath, JSON.stringify(result, null, 2), 'utf-8');

    // Write timestamped version
    const timestampStr = result.timestamp.replace(/[:.]/g, '-');
    const archivedPath = join(allDir, `external-test-${timestampStr}.json`);
    writeFileSync(archivedPath, JSON.stringify(result, null, 2), 'utf-8');

    console.log(`✅ External test result saved to ${latestPath}`);
}

/**
 * Read the latest external test result.
 */
export function readExternalTestResult(): ExternalTestResult | null {
    const latestPath = join(getDeploymentInfoDir(), 'external-test_latest.json');
    if (!existsSync(latestPath)) {
        return null;
    }
    try {
        const raw = readFileSync(latestPath, 'utf-8');
        return JSON.parse(raw) as ExternalTestResult;
    } catch {
        return null;
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * List all archived files for a given category.
 * 
 * @param category - 'gas-costs' or 'deployment'
 * @param name - Optional name filter (e.g., 'game-manager' for gas costs)
 */
export function listArchivedFiles(category: 'gas-costs' | 'deployment', name?: string): string[] {
    const baseDir = category === 'gas-costs' ? getGasCostsDir() : getDeploymentInfoDir();
    const allDir = join(baseDir, 'all');
    
    if (!existsSync(allDir)) {
        return [];
    }
    
    const files = readdirSync(allDir).filter(f => f.endsWith('.json'));
    
    if (name) {
        return files.filter(f => f.startsWith(name + '-'));
    }
    
    return files;
}
