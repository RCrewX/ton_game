import { Address, beginCell, Cell, toNano } from '@ton/core';

// Constants - must match contracts/soulless_slot_machine/static.tolk
export const BASIC_STORAGE_TAX = toNano('0.01');
export const TRY_LUCK_REQUIRED_AMOUNT = toNano('1'); // Exact 1 TON required
export const TRY_LUCK_MAX_AMOUNT = toNano('1.2'); // Threshold for returning excess
export const DEFAULT_MINT_AMOUNT = 100n; // Default mint amount (100 jettons)
export const WIN_CHANCE_PERCENT = 5; // 5% chance to win

// Gas costs
export const GAS_COST_TRY_LUCK = toNano('0.06');
export const GAS_COST_SET_MINT_AMOUNT = toNano('0.015');
export const GAS_COST_REQUEST_MINT = toNano('0.22');
export const GAS_COST_RETURN_EXCESS = toNano('0.01');

// Opcodes
export const Opcodes = {
    OP_TRY_LUCK: 0xa1b2c3d4,
    OP_SET_MINT_AMOUNT: 0xb2c3d4e5,
    OP_RETURN_EXCESSES_BACK: 0xd53276db,
    OP_LITERALY_ANYTHING: 0x0a1b2c3d,
    OP_FORWARD_MINT_REQUEST: 0xf62ed009,
} as const;

// Message types
export type TryLuck = {
    queryId: bigint;
};

export type SetMintAmount = {
    mintAmount: bigint;
};

export type ForwardMintRequest = {
    receiver: Address;
    amount: bigint;
};

// Encode functions
export function encodeTryLuck(msg: TryLuck): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_TRY_LUCK, 32)
        .storeUint(msg.queryId, 64)
        .endCell();
}

export function encodeSetMintAmount(msg: SetMintAmount): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_SET_MINT_AMOUNT, 32)
        .storeCoins(msg.mintAmount)
        .endCell();
}

export function encodeForwardMintRequest(msg: ForwardMintRequest): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_FORWARD_MINT_REQUEST, 32)
        .storeAddress(msg.receiver)
        .storeCoins(msg.amount)
        .endCell();
}
