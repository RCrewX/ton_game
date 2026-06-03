import { Address, toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { GameManager } from '../wrappers/game_manager/GameManager';
import { Retranslator } from '../wrappers/game_manager/Retranslator';
import { NFTPrinter } from '../wrappers/printers/nft_printer/NFTPrinter';
import { SBTPrinter } from '../wrappers/printers/sbt_printer/SBTPrinter';
import { ToolsInfo } from '../wrappers/game_manager/RetranslatorTypes';
import { GAS_COST_REDIRECT_MESSAGE } from '../wrappers/game_manager/types';
import { Network, readNetworkDeploymentData } from '../lib/buildOutput';

// =============================================================================
// deployPrinters — deploy NFTPrinter + SBTPrinter (admin == GameManager) and wire
// their addresses into R*.toolsInfo via GM.RedirectMessage -> SetToolsInfo.
//
//   Run AFTER the core system (GM + R*) is deployed:
//       pnpm bp run deployPrinters            # testnet (interactive)
//
// Order of operations (documented; mirrors test_utils printer setup):
//   1. Deploy NFTPrinter (admin = GM, item code = proven NFTItem code).
//   2. Deploy SBTPrinter (admin = GM, item code = proven gate-fixed SBTNItem code).
//   3. owner -> GM.RedirectMessage -> R*.SetToolsInfo { nftPrinterAddress,
//      sbtPrinterAddress } (so R* sees sender == GM).
//
// This script ONLY deploys + wires. It does NOT regenerate deployment_latest.json;
// after running, refresh that file via the repo's deploy tooling so the
// `ultimate_amusement_park` consumer sees the new printer entities + opcodes (and
// the already-changed sbtn code hashes). See the seam-delta note in the result report.
//
// SAFETY: never run against mainnet without an explicit, deliberate decision.
// =============================================================================

// v1 keeps any existing fee config OFF; toolsInfo here only carries printer addrs.
function buildToolsInfo(nftPrinter: Address, sbtPrinter: Address): ToolsInfo {
    return {
        feeNumerator: 0,
        feeDenominator: 1,
        feeCollector: null,
        nftPrinterAddress: nftPrinter,
        sbtPrinterAddress: sbtPrinter,
        extra: null,
    };
}

export async function run(provider: NetworkProvider): Promise<void> {
    const net = provider.network();
    if (net !== 'testnet' && net !== 'mainnet') {
        throw new Error(`Unsupported network for printer deploy: ${net}`);
    }
    const network = net as Network;

    // Resolve the already-deployed GM + R* from the deployment manifest.
    const data = readNetworkDeploymentData(network, true);
    if (!data || !data.gameManager || !data.retranslator) {
        throw new Error(
            `GM/R* not found in the ${network} deployment manifest. Deploy the core system first.`,
        );
    }
    const gameManagerAddress = Address.parse(data.gameManager.bounceable);
    const retranslatorAddress = Address.parse(data.retranslator.bounceable);

    console.log(`Network:       ${network}`);
    console.log(`GameManager:   ${gameManagerAddress.toString()}`);
    console.log(`Retranslator:  ${retranslatorAddress.toString()}`);
    if (network === 'mainnet') {
        console.log('\n*** MAINNET printer deploy — proceed only if this is intentional. ***\n');
    }

    // Compile codes. Printers reuse the proven item codes (the SBTN item already
    // carries the collection-only sbtn_init gate + EXACT destroy-reserve fix).
    const nftItemCode = await compile('NFTItem');
    const sbtnItemCode = await compile('SBTNItem');
    const nftPrinterCode = await compile('NFTPrinter');
    const sbtPrinterCode = await compile('SBTPrinter');

    const owner = provider.sender();

    // 1) NFTPrinter (TEP-62, transferable). Royalty -> owner by default.
    const ownerAddr = owner.address;
    if (!ownerAddr) throw new Error('No sender address available from the provider wallet.');
    const nftPrinter = provider.open(
        NFTPrinter.createFromConfig(
            {
                nftItemCode,
                adminAddress: gameManagerAddress,
                royaltyParams: { numerator: 5, denominator: 100, royaltyAddress: ownerAddr },
            },
            nftPrinterCode,
        ),
    );
    await nftPrinter.sendDeploy(owner, toNano('0.1'));
    await provider.waitForDeploy(nftPrinter.address);
    console.log(`NFTPrinter deployed: ${nftPrinter.address.toString()}`);

    // 2) SBTPrinter (soulbound, revocable).
    const sbtPrinter = provider.open(
        SBTPrinter.createFromConfig(
            { sbtnItemCode, adminAddress: gameManagerAddress },
            sbtPrinterCode,
        ),
    );
    await sbtPrinter.sendDeploy(owner, toNano('0.1'));
    await provider.waitForDeploy(sbtPrinter.address);
    console.log(`SBTPrinter deployed: ${sbtPrinter.address.toString()}`);

    // 3) Wire toolsInfo into R* through GM (owner -> GM -> R*).
    const gameManager = provider.open(GameManager.createFromAddress(gameManagerAddress));
    await gameManager.sendRedirectMessage(
        owner,
        toNano('0.3'),
        retranslatorAddress,
        Retranslator.setToolsInfoMessage(buildToolsInfo(nftPrinter.address, sbtPrinter.address)),
        toNano('0.2'),
    );
    console.log('SetToolsInfo relayed to R* (printer addresses registered).');
    console.log(`(GAS_COST_REDIRECT_MESSAGE ref = ${GAS_COST_REDIRECT_MESSAGE.toString()})`);

    console.log('\nNEXT STEPS (not done by this script):');
    console.log('  - Refresh deployment_info/deployment_latest.json via the repo deploy tooling');
    console.log('    (adds nftPrinter/sbtPrinter addresses + code hashes; also refreshes the');
    console.log('     already-changed sbtnItem/sbtnCollection code BOCs).');
    console.log('  - Hand the seam-delta note to the ultimate_amusement_park consumer.');
}
