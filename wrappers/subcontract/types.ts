import { Address, beginCell, Cell, toNano } from '@ton/core';

// Gas costs from gas consumption tests (in TON)
// These match the constants in contracts/subcontract/static.tolk
export const GAS_COST_REDIRECT_MESSAGE = toNano("0.005"); // 0.0031816 + buffer

// Opcodes
export const Opcodes = {
    OP_REDIRECT_MESSAGE: 0x3b4c5d6e,
    OP_RETURN_EXCESSES_BACK: 0xd53276db,
    OP_LITERALY_ANYTHING: 0x0a1b2c3d,
} as const;

// Message types
export type RedirectMessage = {
    queryId: bigint;
    destination: Address;
    messageBody: Cell;
    forwardTonAmount: bigint;
};

// Encode functions
export function encodeRedirectMessage(msg: RedirectMessage): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_REDIRECT_MESSAGE, 32)
        .storeUint(msg.queryId, 64)
        .storeAddress(msg.destination)
        .storeRef(msg.messageBody)
        .storeCoins(msg.forwardTonAmount)
        .endCell();
}

