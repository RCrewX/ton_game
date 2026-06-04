/**
 * buildAbi.ts — regenerate deployment_info/deployment_latest.json OFFLINE.
 *
 * This is the no-broadcast ABI publisher: it compiles every contract, rebuilds
 * `contractCodes` (incl. the SSMSlot code) and `constants` (via gameConstants),
 * recalculates all addresses for the existing deployment owner, and writes the
 * json with `deployed:false` (pending a real redeploy). It NEVER connects to a
 * network or broadcasts — run it to refresh the published interface after a
 * contract change, then the user runs the real `deploy` to flip addresses live.
 *
 *   npx ts-node scripts/buildAbi.ts        (or: pnpm abi)
 *
 * Owner address is taken from the existing json (testnet then mainnet), or from
 * $DEPLOY_OWNER_ADDRESS. ownerPublicKey defaults to 0 — so ONLY the ship_station
 * (subcontract) address is a placeholder here; every GM, R-star, SSM, printer,
 * jetton and game address is exact (they don't depend on the pubkey). The real
 * deploy fixes ship_station.
 */
import { Address } from '@ton/core';
import { compile } from '@ton/blueprint';
import { calculateNetworkAddresses } from './deploySystem';
import {
    getContractCodeData,
    writeFullDeploymentData,
    readDeploymentData,
    DeploymentData,
    ContractCodes,
} from '../lib/buildOutput';
import { buildGameConstants } from '../lib/gameConstants';

async function main(): Promise<void> {
    const existing = readDeploymentData();

    const ownerStr =
        process.env.DEPLOY_OWNER_ADDRESS ||
        existing.testnet?.ownerAddress?.nonBounceable ||
        existing.mainnet?.ownerAddress?.nonBounceable;
    if (!ownerStr) {
        throw new Error('No owner address found (set $DEPLOY_OWNER_ADDRESS or provide an existing deployment json).');
    }
    const ownerAddress = Address.parse(ownerStr);
    const ownerPublicKey = 0n; // placeholder; only affects ship_station (see header)
    const shipStationId = 0n;
    const jettonContentUri = process.env.JETTON_CONTENT_URI || 'https://example.com/jetton.json';

    console.log('Compiling contracts (offline)...');
    const gameManagerCode = await compile('GameManager');
    const retranslatorCode = await compile('Retranslator');
    const gameCode = await compile('Game');
    const shipCode = await compile('Ship');
    const coordinateCellCode = await compile('CoordinateCell');
    const ssmCode = await compile('SoullessSlotMachine');
    const ssmSlotCode = await compile('SSMSlot');
    const jettonWalletCode = await compile('JettonWallet');
    const jettonMinterCode = await compile('JettonMinter');
    const subcontractCode = await compile('Subcontract');
    const sbtItemCode = await compile('SBTItem');
    const sbtCollectionCode = await compile('SBTCollection');
    const sbtnItemCode = await compile('SBTNItem');
    const sbtnCollectionCode = await compile('SBTNCollection');
    const nftItemCode = await compile('NFTItem');
    const nftPrinterItemCode = await compile('NFTPrinterItem');
    const sbtPrinterItemCode = await compile('SBTPrinterItem');
    const nftPrinterCode = await compile('NFTPrinter');
    const sbtPrinterCode = await compile('SBTPrinter');

    const contractCodes: ContractCodes = {
        gameManager: getContractCodeData(gameManagerCode),
        retranslator: getContractCodeData(retranslatorCode),
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
                ssmSlot: getContractCodeData(ssmSlotCode),
            },
        },
        sbtCollection: getContractCodeData(sbtCollectionCode),
        sbtItem: getContractCodeData(sbtItemCode),
        sbtnCollection: getContractCodeData(sbtnCollectionCode),
        sbtnItem: getContractCodeData(sbtnItemCode),
        nftItem: getContractCodeData(nftItemCode),
        nftPrinterItem: getContractCodeData(nftPrinterItemCode),
        sbtPrinterItem: getContractCodeData(sbtPrinterItemCode),
        nftPrinter: getContractCodeData(nftPrinterCode),
        sbtPrinter: getContractCodeData(sbtPrinterCode),
    };

    const testnet = calculateNetworkAddresses(
        ownerAddress, gameManagerCode, retranslatorCode, gameCode, shipCode, coordinateCellCode,
        ssmCode, ssmSlotCode, jettonMinterCode, jettonWalletCode, subcontractCode,
        nftPrinterCode, sbtPrinterCode, nftPrinterItemCode, sbtPrinterItemCode,
        true, shipStationId, ownerPublicKey, jettonContentUri,
    );
    const mainnet = calculateNetworkAddresses(
        ownerAddress, gameManagerCode, retranslatorCode, gameCode, shipCode, coordinateCellCode,
        ssmCode, ssmSlotCode, jettonMinterCode, jettonWalletCode, subcontractCode,
        nftPrinterCode, sbtPrinterCode, nftPrinterItemCode, sbtPrinterItemCode,
        false, shipStationId, ownerPublicKey, jettonContentUri,
    );

    const data: DeploymentData = {
        timestamp: new Date().toISOString(),
        constants: buildGameConstants(),
        contractCodes,
        // deployed:false — these addresses are the NEW code's calculated addresses,
        // pending a real redeploy. ship_station is a placeholder (pubkey=0).
        testnet: { ...testnet, status: undefined },
        mainnet: { ...mainnet, status: undefined },
    };

    writeFullDeploymentData(data);
    console.log('✅ ABI regenerated (offline, deployed:false). Run `pnpm deploy` to make addresses live.');
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('buildAbi failed:', e);
        process.exit(1);
    });
