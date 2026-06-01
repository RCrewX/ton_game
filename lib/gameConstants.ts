/**
 * Game Constants Aggregator
 *
 * Single source of truth for the *non-secret* constants other projects
 * (ton_site, new_tg_bot, ton_provider_system, …) need to stay in sync with
 * `ton_game`: opcodes, error codes, gas costs, TON amounts, enums and the
 * on-chain storage layout.
 *
 * Provenance:
 *  - Opcodes / gas costs / TON amounts / enums / storage layout are imported
 *    from the TypeScript wrappers (`wrappers/**`), which are the canonical
 *    TS values used to build/parse messages.
 *  - Error codes are parsed *live* from the Tolk sources (`contracts/**`), so
 *    they can never drift from the deployed contracts.
 *
 * Everything here is JSON-serialisable:
 *  - opcodes are emitted as zero-padded 8-hex strings (e.g. "0x5a1b2c3d").
 *    `Number("0x5a1b2c3d")` recovers the numeric value in JS/TS.
 *  - TON / jetton amounts are emitted as decimal nanoTON / nano-unit *strings*
 *    (bigint can't be represented in JSON).
 *  - plain counts (HP, percentages, bit widths) are emitted as numbers.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import {
    Opcodes as GameManagerOpcodes,
    GAS_COST_DEPLOY_JETTON,
    GAS_COST_SET_GAMES_INFO,
    GAS_COST_REDIRECT_MESSAGE,
    GAS_COST_SET_ALLOW_BURN,
    GAS_COST_REQUEST_BURN,
} from '../wrappers/game_manager/types';

import {
    Opcodes as SsmOpcodes,
    TRY_LUCK_REQUIRED_AMOUNT,
    TRY_LUCK_MAX_AMOUNT,
    DEFAULT_MINT_AMOUNT,
    WIN_CHANCE_PERCENT,
    GAS_COST_TRY_LUCK,
    GAS_COST_SET_MINT_AMOUNT,
    GAS_COST_REQUEST_MINT as SSM_GAS_COST_REQUEST_MINT,
    GAS_COST_RETURN_EXCESS,
} from '../wrappers/soulless_slot_machine/types';

import {
    Opcodes as SubcontractOpcodes,
    GAS_COST_FORWARD,
    GAS_COST_FORWARD_WITH_INIT,
    GAS_COST_MANUAL_DEPLOY,
} from '../wrappers/subcontract/types';

import {
    Opcodes as TrgOpcodes,
    JettonUsageMode,
    BASIC_STORAGE_TAX,
    BASIC_SHIP_HP,
    MINT_TON_AMOUNT,
    GAS_COST_REQUEST_SHIP_ADDRESS,
    GAS_COST_REQUEST_COORDINATE_CELL_ADDRESS,
    GAS_COST_REQUEST_TO_MOVE,
    GAS_COST_MOVE_SHIP_TO_CC,
    GAS_COST_MOVE,
    GAS_COST_MOVE_END,
    GAS_COST_REQUEST_MINT as TRG_GAS_COST_REQUEST_MINT,
    GAS_COST_REQUEST_SHIP_TO_MINT,
    GAS_COST_FORWARD_MINT_REQUEST,
    GAS_COST_JETTON_USED,
    GAS_COST_SHIP_UPGRADE,
    GAS_COST_RESET_SHIP,
    GAS_COST_TRANSFER_NOTIFICATION,
    HARD_TRAVEL_MIN_VALUE,
} from '../wrappers/ton_race_game/types';

import { X_TYPE_BITS, Y_TYPE_BITS, HP_TYPE_BITS, UniqueResult, MoveMode } from '../wrappers/ton_race_game/structs';

import { Op as NftOp } from '../wrappers/tep/nft/types';
import { Op as SbtOp } from '../wrappers/tep/sbt/types';
import { Op as JettonOp, Errors as JettonErrors } from '../wrappers/tep/jetton/JettonConstants';

/**
 * Bump when the *shape* of the `constants` section changes (not when a value
 * changes) so consumers can guard against incompatible layouts.
 */
export const CONSTANTS_SCHEMA_VERSION = 1;

// ============================================================================
// Serialisation helpers
// ============================================================================

/** 32-bit opcode -> "0xXXXXXXXX" (8 hex digits, unsigned). */
function hex(op: number): string {
    return '0x' + (op >>> 0).toString(16).padStart(8, '0');
}

/** bigint -> decimal string (nanoTON / nano-units). */
function nano(v: bigint): string {
    return v.toString();
}

/** Map a record of opcode numbers to hex strings. */
function hexMap(src: Record<string, number>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(src)) {
        out[k] = hex(v);
    }
    return out;
}

/** Read every numeric static member of a class-with-static-numbers (jetton Op/Errors). */
function staticNumberMap(cls: Record<string, unknown>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(cls)) {
        if (typeof v === 'number') out[k] = v;
    }
    return out;
}

// ============================================================================
// Error codes — parsed live from Tolk sources
// ============================================================================

/** Repo root (this file lives in `lib/`). */
const REPO_ROOT = join(__dirname, '..');

/** Match `const ERR_FOO = 123` / `const ERROR_BAR = 0xFFFF` (ignores `ton(...)` consts). */
const ERROR_CONST_RE = /^\s*const\s+(ERR(?:OR)?_[A-Z0-9_]+)\s*=\s*(0x[0-9a-fA-F]+|\d+)/gm;

function parseErrorCodes(relPath: string): Record<string, number> {
    const out: Record<string, number> = {};
    let raw: string;
    try {
        raw = readFileSync(join(REPO_ROOT, relPath), 'utf-8');
    } catch (e) {
        throw new Error(`Cannot read Tolk error source ${relPath}: ${(e as Error).message}`);
    }
    let m: RegExpExecArray | null;
    ERROR_CONST_RE.lastIndex = 0;
    while ((m = ERROR_CONST_RE.exec(raw)) !== null) {
        out[m[1]] = m[2].startsWith('0x') ? parseInt(m[2], 16) : parseInt(m[2], 10);
    }
    return out;
}

// ============================================================================
// Constants assembly
// ============================================================================

export interface GameConstants {
    schemaVersion: number;
    _note: string;
    token: unknown;
    opcodes: Record<string, Record<string, string>>;
    errors: Record<string, Record<string, number>>;
    gasCosts: Record<string, Record<string, string>>;
    amounts: Record<string, string>;
    gameConstants: Record<string, number | string>;
    enums: Record<string, Record<string, number>>;
    storageLayout: Record<string, number>;
    sendModes: Record<string, number>;
}

function readTokenMetadata(): unknown {
    try {
        return JSON.parse(readFileSync(join(REPO_ROOT, 'metadata.json'), 'utf-8'));
    } catch {
        return null;
    }
}

/**
 * Build the full, JSON-serialisable constants object.
 */
export function buildGameConstants(): GameConstants {
    return {
        schemaVersion: CONSTANTS_SCHEMA_VERSION,
        _note:
            'Single source of truth for ton_game opcodes/errors/constants. ' +
            'opcodes are "0x"-hex strings (use Number(v) for the integer); ' +
            'gasCosts and amounts are decimal nanoTON/nano-unit strings; ' +
            'errors are parsed live from contracts/**/*.tolk.',

        token: readTokenMetadata(),

        opcodes: {
            gameManager: hexMap(GameManagerOpcodes),
            soullessSlotMachine: hexMap(SsmOpcodes),
            subcontract: hexMap(SubcontractOpcodes),
            tonRaceGame: hexMap(TrgOpcodes),
            jetton: hexMap(staticNumberMap(JettonOp as unknown as Record<string, unknown>)),
            nft: hexMap(NftOp),
            sbt: hexMap(SbtOp),
        },

        errors: {
            common: parseErrorCodes('contracts/ton_race_game/static/errors.tolk'),
            gameManager: parseErrorCodes('contracts/game_manager/static.tolk'),
            soullessSlotMachine: parseErrorCodes('contracts/soulless_slot_machine/static.tolk'),
            subcontract: parseErrorCodes('contracts/subcontract/static.tolk'),
            tonRaceGame: parseErrorCodes('contracts/ton_race_game/static/errors.tolk'),
            jetton: { ...staticNumberMap(JettonErrors as unknown as Record<string, unknown>), ...parseErrorCodes('contracts/tep/jetton/errors.tolk') },
            nft: parseErrorCodes('contracts/tep/nft/errors.tolk'),
            sbt: parseErrorCodes('contracts/tep/sbt/errors.tolk'),
        },

        gasCosts: {
            gameManager: {
                GAS_COST_DEPLOY_JETTON: nano(GAS_COST_DEPLOY_JETTON),
                GAS_COST_SET_GAMES_INFO: nano(GAS_COST_SET_GAMES_INFO),
                GAS_COST_REDIRECT_MESSAGE: nano(GAS_COST_REDIRECT_MESSAGE),
                GAS_COST_SET_ALLOW_BURN: nano(GAS_COST_SET_ALLOW_BURN),
                GAS_COST_REQUEST_BURN: nano(GAS_COST_REQUEST_BURN),
            },
            soullessSlotMachine: {
                GAS_COST_TRY_LUCK: nano(GAS_COST_TRY_LUCK),
                GAS_COST_SET_MINT_AMOUNT: nano(GAS_COST_SET_MINT_AMOUNT),
                GAS_COST_REQUEST_MINT: nano(SSM_GAS_COST_REQUEST_MINT),
                GAS_COST_RETURN_EXCESS: nano(GAS_COST_RETURN_EXCESS),
            },
            subcontract: {
                GAS_COST_FORWARD: nano(GAS_COST_FORWARD),
                GAS_COST_FORWARD_WITH_INIT: nano(GAS_COST_FORWARD_WITH_INIT),
                GAS_COST_MANUAL_DEPLOY: nano(GAS_COST_MANUAL_DEPLOY),
            },
            tonRaceGame: {
                GAS_COST_REQUEST_SHIP_ADDRESS: nano(GAS_COST_REQUEST_SHIP_ADDRESS),
                GAS_COST_REQUEST_COORDINATE_CELL_ADDRESS: nano(GAS_COST_REQUEST_COORDINATE_CELL_ADDRESS),
                GAS_COST_REQUEST_TO_MOVE: nano(GAS_COST_REQUEST_TO_MOVE),
                GAS_COST_MOVE_SHIP_TO_CC: nano(GAS_COST_MOVE_SHIP_TO_CC),
                GAS_COST_MOVE: nano(GAS_COST_MOVE),
                GAS_COST_MOVE_END: nano(GAS_COST_MOVE_END),
                GAS_COST_REQUEST_MINT: nano(TRG_GAS_COST_REQUEST_MINT),
                GAS_COST_REQUEST_SHIP_TO_MINT: nano(GAS_COST_REQUEST_SHIP_TO_MINT),
                GAS_COST_FORWARD_MINT_REQUEST: nano(GAS_COST_FORWARD_MINT_REQUEST),
                GAS_COST_JETTON_USED: nano(GAS_COST_JETTON_USED),
                GAS_COST_SHIP_UPGRADE: nano(GAS_COST_SHIP_UPGRADE),
                GAS_COST_RESET_SHIP: nano(GAS_COST_RESET_SHIP),
                GAS_COST_TRANSFER_NOTIFICATION: nano(GAS_COST_TRANSFER_NOTIFICATION),
            },
        },

        // TON-denominated amounts (nanoTON strings).
        amounts: {
            BASIC_STORAGE_TAX: nano(BASIC_STORAGE_TAX),
            MINT_TON_AMOUNT: nano(MINT_TON_AMOUNT),
            TRY_LUCK_REQUIRED_AMOUNT: nano(TRY_LUCK_REQUIRED_AMOUNT),
            TRY_LUCK_MAX_AMOUNT: nano(TRY_LUCK_MAX_AMOUNT),
            HARD_TRAVEL_MIN_VALUE: nano(HARD_TRAVEL_MIN_VALUE),
        },

        // Plain game-logic counts (not TON amounts).
        gameConstants: {
            BASIC_SHIP_HP: nano(BASIC_SHIP_HP),
            DEFAULT_MINT_AMOUNT: nano(DEFAULT_MINT_AMOUNT),
            WIN_CHANCE_PERCENT: WIN_CHANCE_PERCENT,
        },

        enums: {
            MoveMode: { LEFT: MoveMode.LEFT, UP: MoveMode.UP, RIGHT: MoveMode.RIGHT, EXIT: MoveMode.EXIT },
            UniqueResult: {
                SAFE_EXIT: UniqueResult.SAFE_EXIT,
                CRASH: UniqueResult.CRASH,
                CONTINUE: UniqueResult.CONTINUE,
            },
            JettonUsageMode: {
                SHIP_UPGRADE: JettonUsageMode.SHIP_UPGRADE,
                FAST_TRAVEL_UPGRADE: JettonUsageMode.FAST_TRAVEL_UPGRADE,
            },
        },

        storageLayout: {
            X_TYPE_BITS,
            Y_TYPE_BITS,
            HP_TYPE_BITS,
        },

        sendModes: {
            CARRY_ALL_REMAINING_BALANCE: 128,
        },
    };
}
