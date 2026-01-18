/**
 * Check Connection Script
 *
 * Tests connectivity to all configured TON API providers:
 * - Chainstack API (testnet and mainnet if configured)
 * - Public toncenter endpoints (testnet and mainnet)
 *
 * Usage:
 *   pnpm check-connection
 *   pnpm blueprint run checkConnection
 */

import { Address } from '@ton/core';
import * as dotenv from 'dotenv';
import {
    Network,
    getChainstackEndpoints,
    isChainstackConfigured,
    getAddressState,
    getAddressBalance,
    runGetMethod,
    toV2Base,
} from '../lib/chainstack';

// Load environment variables
dotenv.config();

// Well-known addresses for testing (system contracts that always exist)
const TEST_ADDRESSES: Record<Network, string> = {
    testnet: 'EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2', // Testnet elector
    mainnet: 'Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF', // Mainnet elector
};

// Public endpoints (fallback)
const PUBLIC_ENDPOINTS: Record<Network, { v2: string; v3: string }> = {
    testnet: {
        v2: 'https://testnet.toncenter.com/api/v2',
        v3: 'https://testnet.toncenter.com/api/v3',
    },
    mainnet: {
        v2: 'https://toncenter.com/api/v2',
        v3: 'https://toncenter.com/api/v3',
    },
};

interface ConnectionResult {
    provider: string;
    network: Network;
    endpoint: string;
    status: 'ok' | 'error' | 'not_configured';
    latencyMs?: number;
    error?: string;
    details?: {
        addressState?: string;
        balance?: string;
        getMethodWorks?: boolean;
    };
}

async function testEndpoint(
    providerName: string,
    network: Network,
    endpoint: string
): Promise<ConnectionResult> {
    const testAddress = Address.parse(TEST_ADDRESSES[network]);
    const startTime = Date.now();

    try {
        // Test 1: getAddressState
        const state = await getAddressState(endpoint, testAddress);
        const stateLatency = Date.now() - startTime;

        // Test 2: getAddressBalance
        const balanceStart = Date.now();
        const balance = await getAddressBalance(endpoint, testAddress);
        const balanceLatency = Date.now() - balanceStart;

        // Test 3: runGetMethod (call a simple method on elector)
        const getMethodStart = Date.now();
        let getMethodWorks = false;
        try {
            // Try to call 'seqno' or 'get_public_key' - common methods
            await runGetMethod(endpoint, testAddress, 'active_election_id', []);
            getMethodWorks = true;
        } catch {
            // Some methods may not exist, but if we got a response, the endpoint works
            getMethodWorks = false;
        }
        const getMethodLatency = Date.now() - getMethodStart;

        const totalLatency = Date.now() - startTime;

        return {
            provider: providerName,
            network,
            endpoint: toV2Base(endpoint),
            status: 'ok',
            latencyMs: totalLatency,
            details: {
                addressState: state,
                balance: balance.toString(),
                getMethodWorks,
            },
        };
    } catch (error: any) {
        return {
            provider: providerName,
            network,
            endpoint: toV2Base(endpoint),
            status: 'error',
            latencyMs: Date.now() - startTime,
            error: error.message || String(error),
        };
    }
}

async function checkAllConnections(): Promise<ConnectionResult[]> {
    const results: ConnectionResult[] = [];

    console.log('=== TON API Connection Check ===\n');

    // Check Chainstack testnet
    console.log('Checking Chainstack Testnet...');
    if (isChainstackConfigured('testnet')) {
        const endpoints = getChainstackEndpoints('testnet');
        const result = await testEndpoint('Chainstack', 'testnet', endpoints.v2);
        results.push(result);
        printResult(result);
    } else {
        results.push({
            provider: 'Chainstack',
            network: 'testnet',
            endpoint: '-',
            status: 'not_configured',
        });
        console.log('  ⚠ Not configured (set CHAINSTACK_API_V2 in .env)\n');
    }

    // Check Chainstack mainnet
    console.log('Checking Chainstack Mainnet...');
    if (isChainstackConfigured('mainnet')) {
        const endpoints = getChainstackEndpoints('mainnet');
        const result = await testEndpoint('Chainstack', 'mainnet', endpoints.v2);
        results.push(result);
        printResult(result);
    } else {
        results.push({
            provider: 'Chainstack',
            network: 'mainnet',
            endpoint: '-',
            status: 'not_configured',
        });
        console.log('  ⚠ Not configured (set CHAINSTACK_API_MAINNET_V2 in .env)\n');
    }

    // Check public toncenter testnet
    console.log('Checking Toncenter Testnet (public)...');
    const toncenterTestnet = await testEndpoint(
        'Toncenter',
        'testnet',
        PUBLIC_ENDPOINTS.testnet.v2
    );
    results.push(toncenterTestnet);
    printResult(toncenterTestnet);

    // Check public toncenter mainnet
    console.log('Checking Toncenter Mainnet (public)...');
    const toncenterMainnet = await testEndpoint(
        'Toncenter',
        'mainnet',
        PUBLIC_ENDPOINTS.mainnet.v2
    );
    results.push(toncenterMainnet);
    printResult(toncenterMainnet);

    return results;
}

function printResult(result: ConnectionResult): void {
    if (result.status === 'ok') {
        console.log(`  ✓ Connected (${result.latencyMs}ms)`);
        console.log(`    Endpoint: ${result.endpoint}`);
        if (result.details) {
            console.log(`    State: ${result.details.addressState}`);
            console.log(`    Balance: ${result.details.balance} nanoTON`);
            console.log(`    GetMethod: ${result.details.getMethodWorks ? 'works' : 'limited'}`);
        }
    } else if (result.status === 'error') {
        console.log(`  ✗ Failed (${result.latencyMs}ms)`);
        console.log(`    Endpoint: ${result.endpoint}`);
        console.log(`    Error: ${result.error}`);
    }
    console.log('');
}

function printSummary(results: ConnectionResult[]): void {
    console.log('=== Connection Summary ===\n');

    const table: string[] = [];
    table.push('Provider      | Network  | Status         | Latency');
    table.push('------------- | -------- | -------------- | -------');

    for (const result of results) {
        const provider = result.provider.padEnd(13);
        const network = result.network.padEnd(8);
        let status: string;
        let latency: string;

        switch (result.status) {
            case 'ok':
                status = '✓ OK'.padEnd(14);
                latency = `${result.latencyMs}ms`;
                break;
            case 'error':
                status = '✗ Error'.padEnd(14);
                latency = '-';
                break;
            case 'not_configured':
                status = '⚠ Not Config'.padEnd(14);
                latency = '-';
                break;
        }

        table.push(`${provider} | ${network} | ${status} | ${latency}`);
    }

    console.log(table.join('\n'));
    console.log('');

    // Recommendations
    const chainstackConfigured = results.some(
        (r) => r.provider === 'Chainstack' && r.status !== 'not_configured'
    );
    const chainstackWorking = results.some(
        (r) => r.provider === 'Chainstack' && r.status === 'ok'
    );
    const toncenterWorking = results.some(
        (r) => r.provider === 'Toncenter' && r.status === 'ok'
    );

    console.log('=== Recommendations ===\n');

    if (!chainstackConfigured) {
        console.log('💡 Configure Chainstack for better reliability:');
        console.log('   Add to .env:');
        console.log('   CHAINSTACK_API_V2=https://ton-testnet.core.chainstack.com/<key>/api/v2');
        console.log('   CHAINSTACK_API_V3=https://ton-testnet.core.chainstack.com/<key>/api/v3');
        console.log('');
    }

    if (chainstackWorking) {
        console.log('✓ Chainstack is configured and working - this is the recommended provider.');
    } else if (chainstackConfigured) {
        console.log('⚠ Chainstack is configured but not working. Check your API key.');
    }

    if (toncenterWorking && !chainstackWorking) {
        console.log('✓ Public Toncenter is working as fallback.');
        console.log('  Note: Public endpoints may have rate limits.');
    }

    if (!chainstackWorking && !toncenterWorking) {
        console.log('✗ No working endpoints found! Check your network connection.');
    }

    console.log('');
}

// Main execution
async function main() {
    try {
        const results = await checkAllConnections();
        printSummary(results);

        // Exit with error code if no connections work
        const anyWorking = results.some((r) => r.status === 'ok');
        if (!anyWorking) {
            process.exit(1);
        }
    } catch (error: any) {
        console.error('Fatal error:', error.message || error);
        process.exit(1);
    }
}

// Blueprint script export
export async function run() {
    await main();
}

// Allow direct execution with ts-node
if (require.main === module) {
    main();
}
