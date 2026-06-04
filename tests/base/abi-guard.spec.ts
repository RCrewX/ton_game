import { readFileSync } from 'fs';
import { join } from 'path';
import { toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Retranslator } from '../../wrappers/game_manager/Retranslator';
import { AnvilErrors } from '../../wrappers/game_manager/RetranslatorTypes';
import { Opcodes as SsmOpcodes } from '../../wrappers/soulless_slot_machine/types';
import { getContractCodeData, mergeContractCodes, ContractCodes, ContractCodeInfo } from '../../lib/buildOutput';
import {
    W5_AUTH_EXTENSION,
    W5_ACTION_SEND_MSG,
    OP_REQUEST_TO_MOVE as SHIP_SESSION_OP_REQUEST_TO_MOVE,
    OP_REVOKE_SESSION,
    ShipSessionErrors,
} from '../../wrappers/ship_session/types';

const hex8 = (op: number) => '0x' + (op >>> 0).toString(16).padStart(8, '0');

// =============================================================================
// ABI drift guard: the PUBLISHED deployment_latest.json must match the ON-CHAIN
// values. Catches a stale json after a contract change (the closing-plan
// deliverable for the uap consumer). Reads the json from disk and cross-checks
// the ANVIL caps / type space / multisplav filter against a live Retranslator,
// plus the live-parsed error codes and the SSM burn opcode.
//
// If this fails, run `pnpm abi` to regenerate the json.
// =============================================================================

function loadAbi(): any {
    const p = join(__dirname, '..', '..', 'deployment_info', 'deployment_latest.json');
    return JSON.parse(readFileSync(p, 'utf-8'));
}

describe('ABI guard (deployment_latest.json vs on-chain)', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let R: SandboxContract<Retranslator>;
    let abi: any;

    beforeAll(async () => {
        blockchain = await Blockchain.create();
        owner = await blockchain.treasury('abiOwner');
        const code = await compile('Retranslator');
        R = blockchain.openContract(
            Retranslator.createFromConfig({ gameManagerAddress: owner.address, ownerAddress: owner.address }, code),
        );
        await R.sendDeploy(owner.getSender(), toNano('0.5'));
        abi = loadAbi();
    }, 120000);

    it('schema version is current (v4)', () => {
        expect(abi.constants.schemaVersion).toBe(4);
        expect(abi.testnet.deployed).toBe(false); // offline ABI publish; redeploy to flip
    });

    it('published ANVIL tier caps + type space match the on-chain get_anvil_caps', async () => {
        const caps = await R.getAnvilCaps();
        const gc = abi.constants.gameConstants;
        expect(gc.ANVIL_TIER_CAP_TYPE0).toBe(caps.genericCap);
        expect(gc.ANVIL_SAFETY_TIER_CAP).toBe(caps.safetyCap);
        expect(gc.ANVIL_MULTISPLAV_TIER_CAP).toBe(caps.multisplavCap);
        expect(gc.ANVIL_MELT_MAX_TIER).toBe(caps.meltMaxTier);
        expect(gc.ANVIL_TYPE_GENERIC).toBe(caps.typeGeneric);
        expect(gc.ANVIL_TYPE_MULTISPLAV).toBe(caps.typeMultisplav);
        // The type-5 multisplav cap must NOT exceed the general safety ceiling.
        expect(caps.multisplavCap).toBeLessThanOrEqual(caps.safetyCap);
    });

    it('published multisplav filter geometry matches on-chain get_multisplav_params', async () => {
        const p = await R.getMultisplavParams();
        const gc = abi.constants.gameConstants;
        expect(gc.ANVIL_MULTISPLAV_FILTER_BITS).toBe(p.bits);
        expect(gc.ANVIL_MULTISPLAV_FILTER_K).toBe(p.k);
        expect(gc.ANVIL_MULTISPLAV_TIER_CAP).toBe(p.tierCap);
        // storageLayout advertises the `seen` field + filter width to the decoder.
        expect(abi.constants.storageLayout.NFT_CONTENT_SEEN_MAYBE_REF).toBe(1);
        expect(abi.constants.storageLayout.MULTISPLAV_FILTER_BITS).toBe(p.bits);
    });

    it('published retranslator error codes match the source-of-truth values', () => {
        const errs = abi.constants.errors.retranslator;
        // The engine throws exactly these (cross-checked in anvil-caps / multisplav specs).
        expect(errs.ERR_ANVIL_TIER_CAP).toBe(AnvilErrors.TIER_CAP);
        expect(errs.ERR_ANVIL_SAFETY_TIER_CAP).toBe(AnvilErrors.SAFETY_TIER_CAP);
        expect(errs.ERR_ANVIL_MULTISPLAV_TIER_CAP).toBe(AnvilErrors.MULTISPLAV_TIER_CAP);
        expect(errs.ERR_ANVIL_MULTISPLAV_ORIGIN_ALREADY_SEEN).toBe(AnvilErrors.MULTISPLAV_ORIGIN_ALREADY_SEEN);
        expect(errs.ERR_ANVIL_MELT_NON_NATIVE).toBe(AnvilErrors.MELT_NON_NATIVE);
        expect(errs.ERR_ANVIL_TIER_TOO_HIGH).toBe(AnvilErrors.TIER_TOO_HIGH);
        expect(errs.ERR_ANVIL_NOT_PRINTER).toBe(AnvilErrors.NOT_PRINTER);
        expect(errs.ERR_ANVIL_RECIPE_ARITY).toBe(AnvilErrors.RECIPE_ARITY);
    });

    it('published SSM burn opcode matches the wrapper', () => {
        const published = abi.constants.opcodes.soullessSlotMachine.OP_SSM_BURN_STAKE;
        expect(published).toBe('0x' + (SsmOpcodes.OP_SSM_BURN_STAKE >>> 0).toString(16).padStart(8, '0'));
    });

    // --- ShipSession (per-user W5 wallet-extension; code-only) ---------------
    it('published ShipSession code-hash matches the freshly compiled contract', async () => {
        const ssCode = await compile('ShipSession');
        expect(abi.contractCodes.shipSession).toBeDefined();
        expect(abi.contractCodes.shipSession.hash).toBe(getContractCodeData(ssCode).hash);
    });

    it('published ShipSession opcodes match the wrapper', () => {
        const ops = abi.constants.opcodes.shipSession;
        expect(ops.W5_AUTH_EXTENSION).toBe(hex8(W5_AUTH_EXTENSION));
        expect(ops.W5_ACTION_SEND_MSG).toBe(hex8(W5_ACTION_SEND_MSG));
        expect(ops.OP_REQUEST_TO_MOVE).toBe(hex8(SHIP_SESSION_OP_REQUEST_TO_MOVE));
        expect(ops.OP_REVOKE_SESSION).toBe(hex8(OP_REVOKE_SESSION));
    });

    it('published ShipSession error codes (950..959) match the wrapper map', () => {
        const errs = abi.constants.errors.shipSession;
        for (const [name, code] of Object.entries(ShipSessionErrors)) {
            expect(errs[name]).toBe(code);
        }
    });
});

// =============================================================================
// Clobber-survival guard: the unified writer must NEVER strip a code-only entry
// (shipSession / ssmSlot / *Item). This is the structural defense behind the
// deploy/abi unification — a live deploy that hands a partial contractCodes set
// can no longer overwrite the complete offline publish.
// =============================================================================
describe('contractCodes clobber defense (mergeContractCodes)', () => {
    const ci = (h: string): ContractCodeInfo => ({ hex: '', hash: h, hashBase64: '' });

    const complete: ContractCodes = {
        gameManager: ci('gm'), retranslator: ci('r'), jettonWallet: ci('jw'), jettonMinter: ci('jm'),
        subcontract: ci('sc'),
        games: {
            ton_race_game: { game: ci('g'), ship: ci('sh'), coordinateCell: ci('cc') },
            soulless_slot_machine: { soullessSlotMachine: ci('ssm'), ssmSlot: ci('slot') },
        },
        sbtCollection: ci('sbtc'), sbtItem: ci('sbti'), sbtnCollection: ci('sbtnc'), sbtnItem: ci('sbtni'),
        nftItem: ci('nfti'), nftPrinterItem: ci('npi'), sbtPrinterItem: ci('spi'),
        nftPrinter: ci('np'), sbtPrinter: ci('sp'),
        shipSession: ci('654aa59e'),
    };

    // The OLD deploySystem bug shape: a code set that forgot the code-only entries.
    const partial: ContractCodes = {
        gameManager: ci('gm2'), jettonWallet: ci('jw2'), jettonMinter: ci('jm2'), subcontract: ci('sc2'),
        games: {
            ton_race_game: { game: ci('g2'), ship: ci('sh2'), coordinateCell: ci('cc2') },
            soulless_slot_machine: { soullessSlotMachine: ci('ssm2') }, // ssmSlot OMITTED
        },
        sbtCollection: ci('sbtc'), sbtItem: ci('sbti'), sbtnCollection: ci('sbtnc'), sbtnItem: ci('sbtni'),
        nftItem: ci('nfti'), nftPrinterItem: ci('npi'), sbtPrinterItem: ci('spi'),
        nftPrinter: ci('np'), sbtPrinter: ci('sp'),
        // shipSession OMITTED — the exact clobber that blocked the W5 consumer.
    };

    it('a partial write cannot strip shipSession or ssmSlot (footgun closed)', () => {
        const merged = mergeContractCodes(complete, partial)!;
        // code-only entries absent from `incoming` SURVIVE from the existing set:
        expect(merged.shipSession?.hash).toBe('654aa59e');
        expect(merged.games.soulless_slot_machine.ssmSlot?.hash).toBe('slot');
        // incoming values still win where present:
        expect(merged.gameManager.hash).toBe('gm2');
        expect(merged.games.ton_race_game.ship.hash).toBe('sh2');
    });

    it('undefined incoming preserves the full set unchanged', () => {
        expect(mergeContractCodes(complete, undefined)).toBe(complete);
    });
});
