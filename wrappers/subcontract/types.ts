import { Address, beginCell, Cell, toNano } from '@ton/core';

// Gas costs from gas consumption tests (in TON)
// These match the constants in contracts/subcontract/static.tolk
export const GAS_COST_FORWARD = toNano("0.005"); // 0.0031816 + buffer
export const GAS_COST_FORWARD_WITH_INIT = toNano("0.01"); // Higher cost for deploy messages

// Opcodes
export const Opcodes = {
    OP_FORWARD: 0x3b4c5d6e,
    OP_FORWARD_WITH_INIT: 0x4c5d6e7f,
} as const;

// Message types
export type Forward = {
    queryId: bigint;
    destination: Address;
    forwardTonAmount: bigint;
    bounce: boolean; // true = Bounce, false = NoBounce
    sendMode: number;
    messageBody: Cell;
};

export type ForwardWithInit = {
    queryId: bigint;
    destination: Address;
    forwardTonAmount: bigint;
    sendMode: number;
    stateInit: Cell; // StateInit cell for contract deployment
    messageBody: Cell;
};

// Encode functions
export function encodeForward(msg: Forward): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_FORWARD, 32)
        .storeUint(msg.queryId, 64)
        .storeAddress(msg.destination)
        .storeCoins(msg.forwardTonAmount)
        .storeBit(msg.bounce)
        .storeUint(msg.sendMode, 8)
        .storeRef(msg.messageBody)
        .endCell();
}

export function encodeForwardWithInit(msg: ForwardWithInit): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_FORWARD_WITH_INIT, 32)
        .storeUint(msg.queryId, 64)
        .storeAddress(msg.destination)
        .storeCoins(msg.forwardTonAmount)
        .storeUint(msg.sendMode, 8)
        .storeRef(msg.stateInit)
        .storeRef(msg.messageBody)
        .endCell();
}

