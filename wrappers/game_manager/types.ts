import { Address, beginCell, Cell } from '@ton/core';

// Opcodes
export const Opcodes = {
    OP_SET_JETTON_MINTER_ADDRESS: 0x1a2b3c4d,
    OP_SET_GAMES: 0x2a3b4c5d,
    OP_REDIRECT_MESSAGE: 0x3b4c5d6e,
    OP_RETURN_EXCESSES_BACK: 0xd53276db,
    OP_LITERALY_ANYTHING: 0x0a1b2c3d,
} as const;

// Message types
export type SetJettonMinterAddress = {
    jettonMinterAddress: Address;
};

export type SetGames = {
    games: Cell;
};

export type RedirectMessage = {
    queryId: bigint;
    destination: Address;
    messageBody: Cell;
    forwardTonAmount: bigint;
};

// Encode functions
export function encodeSetJettonMinterAddress(msg: SetJettonMinterAddress): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_SET_JETTON_MINTER_ADDRESS, 32)
        .storeAddress(msg.jettonMinterAddress)
        .endCell();
}

export function encodeSetGames(msg: SetGames): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_SET_GAMES, 32)
        .storeRef(msg.games)
        .endCell();
}

export function encodeRedirectMessage(msg: RedirectMessage): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_REDIRECT_MESSAGE, 32)
        .storeUint(msg.queryId, 64)
        .storeAddress(msg.destination)
        .storeRef(msg.messageBody)
        .storeCoins(msg.forwardTonAmount)
        .endCell();
}

