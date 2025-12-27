import { Address, beginCell, Cell, toNano } from '@ton/core';

// Gas costs from gas consumption tests (in TON)
// These match the constants in contracts/subcontract/static.tolk
export const GAS_COST_FORWARD = toNano("0.005"); // 0.0031816 + buffer
export const GAS_COST_FORWARD_WITH_INIT = toNano("0.01"); // Higher cost for deploy messages

// Opcodes
export const Opcodes = {
    OP_FORWARD: 0xf1c65e14,
    OP_FORWARD_WITH_INIT: 0x621c7833,
    OP_WITHDRAW: 0x164546a9,
    OP_RETURN_EXCESSES_BACK: 0xd53276db,
    OP_SET_REDIRECT_EXCESS: 0x50245bad,
    OP_SET_EXCESS_THRESHOLD: 0xc64d98a7,
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

export type Withdraw = {
    queryId: bigint;
    amount: bigint;
    receiver: Address;
};

export type SetRedirectExcess = {
    queryId: bigint;
    redirectExcess: boolean;
};

export type SetExcessThreshold = {
    queryId: bigint;
    excessThreshold: bigint;
};

export type ReturnExcessesBack = {
    queryId: bigint;
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

export function encodeWithdraw(msg: Withdraw): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_WITHDRAW, 32)
        .storeUint(msg.queryId, 64)
        .storeCoins(msg.amount)
        .storeAddress(msg.receiver)
        .endCell();
}

export function encodeSetRedirectExcess(msg: SetRedirectExcess): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_SET_REDIRECT_EXCESS, 32)
        .storeUint(msg.queryId, 64)
        .storeBit(msg.redirectExcess)
        .endCell();
}

export function encodeSetExcessThreshold(msg: SetExcessThreshold): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_SET_EXCESS_THRESHOLD, 32)
        .storeUint(msg.queryId, 64)
        .storeCoins(msg.excessThreshold)
        .endCell();
}

export function encodeReturnExcessesBack(msg: ReturnExcessesBack): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_RETURN_EXCESSES_BACK, 32)
        .storeUint(msg.queryId, 64)
        .endCell();
}

