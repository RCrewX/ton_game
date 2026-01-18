#!/usr/bin/env ts-node
/**
 * Helper script to run Blueprint commands with Chainstack endpoints.
 *
 * This script loads environment variables and runs Blueprint with the correct
 * --custom flags for Chainstack API usage.
 *
 * Usage:
 *   ts-node scripts/runWithChainstack.ts <script> [--mainnet] [options]
 *
 * Options are passed to scripts via environment variables (Blueprint limitation):
 *   --id <n>       Sets SCRIPT_ID env var (for deploySystem, testExternalShipStation)
 *   --up           Sets SCRIPT_DIRECTION=up (for moveShip)
 *   --down         Sets SCRIPT_DIRECTION=down (for moveShip)
 *   --left         Sets SCRIPT_DIRECTION=left (for moveShip)
 *   --right        Sets SCRIPT_DIRECTION=right (for moveShip)
 *   --exit         Sets SCRIPT_DIRECTION=exit (for moveShip)
 *   --count <n>    Sets SCRIPT_COUNT env var (for moveShip)
 *
 * Examples:
 *   pnpm chainstack deploySystem
 *   pnpm chainstack deploySystem --mainnet
 *   pnpm chainstack deploySystem --id 4
 *   pnpm chainstack moveShip --up
 *   pnpm chainstack moveShip --up --count 3
 *   pnpm chainstack testExternalShipStation --id 10
 */

import { spawn } from 'child_process';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

function getEndpoint(isMainnet: boolean): string | undefined {
    if (isMainnet) {
        return process.env.CHAINSTACK_API_MAINNET_V2 || process.env.CHAINSTACK_API_MAINNET_V3;
    }
    return process.env.CHAINSTACK_API_V2 || process.env.CHAINSTACK_API_V3;
}

function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let scriptName: string | undefined;
    let isMainnet = false;
    const envVars: Record<string, string> = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--mainnet') {
            isMainnet = true;
        } else if (arg === '--testnet') {
            isMainnet = false;
        } else if (arg === '--id' && args[i + 1]) {
            envVars.SCRIPT_ID = args[++i];
        } else if (arg === '--count' && args[i + 1]) {
            envVars.SCRIPT_COUNT = args[++i];
        } else if (arg === '--up') {
            envVars.SCRIPT_DIRECTION = 'up';
        } else if (arg === '--down') {
            envVars.SCRIPT_DIRECTION = 'down';
        } else if (arg === '--left') {
            envVars.SCRIPT_DIRECTION = 'left';
        } else if (arg === '--right') {
            envVars.SCRIPT_DIRECTION = 'right';
        } else if (arg === '--exit') {
            envVars.SCRIPT_DIRECTION = 'exit';
        } else if (!scriptName && !arg.startsWith('-')) {
            scriptName = arg;
        }
    }

    if (!scriptName) {
        console.error('Usage: pnpm chainstack <script> [--mainnet] [options]');
        console.error('');
        console.error('Options (passed via env vars due to Blueprint limitation):');
        console.error('  --id <n>       Subcontract/ship ID');
        console.error('  --up/down/left/right/exit   Movement direction');
        console.error('  --count <n>    Number of moves');
        console.error('');
        console.error('Examples:');
        console.error('  pnpm chainstack deploySystem');
        console.error('  pnpm chainstack deploySystem --mainnet');
        console.error('  pnpm chainstack deploySystem --id 4');
        console.error('  pnpm chainstack moveShip --up');
        console.error('  pnpm chainstack moveShip --up --count 3');
        console.error('  pnpm chainstack testExternalShipStation --id 10');
        process.exit(1);
    }

    const networkType = isMainnet ? 'mainnet' : 'testnet';
    const endpoint = getEndpoint(isMainnet);

    if (!endpoint) {
        console.error(`Error: Chainstack API not configured for ${networkType}.`);
        console.error('');
        console.error('Please set the following in your .env file:');
        if (isMainnet) {
            console.error('  CHAINSTACK_API_MAINNET_V2=https://ton-mainnet.core.chainstack.com/<key>/api/v2');
        } else {
            console.error('  CHAINSTACK_API_V2=https://ton-testnet.core.chainstack.com/<key>/api/v2');
        }
        process.exit(1);
    }

    // Construct blueprint command
    const blueprintArgs = [
        'run',
        scriptName,
        '--custom',
        `${endpoint}/jsonRPC`,
        '--custom-version',
        'v2',
        '--custom-type',
        networkType,
        '--mnemonic',
    ];

    console.log(`Running: blueprint ${blueprintArgs.join(' ')}`);
    console.log(`Network: ${networkType}`);
    console.log(`Endpoint: ${endpoint}`);
    if (Object.keys(envVars).length > 0) {
        console.log(`Script options: ${JSON.stringify(envVars)}`);
    }
    console.log('');

    // Merge environment variables
    const childEnv = { ...process.env, ...envVars };

    // Spawn blueprint process
    const child = spawn('npx', ['blueprint', ...blueprintArgs], {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: childEnv,
    });

    child.on('error', (err) => {
        console.error('Failed to start blueprint:', err.message);
        process.exit(1);
    });

    child.on('close', (code) => {
        process.exit(code ?? 0);
    });
}

main();
