import { Address, beginCell, Cell, toNano } from '@ton/core';

// Gas costs from gas consumption tests (in TON)
// These match the constants in contracts/game_manager/static.tolk
export const GAS_COST_SET_JETTON_MINTER_ADDRESS = toNano("0.019"); // 0.0184204 + buffer
export const GAS_COST_SET_GAMES = toNano("0.015"); // 0.0141556 + buffer
export const GAS_COST_REDIRECT_MESSAGE = toNano("0.009"); // 0.0081816 + buffer

// Opcodes
export const Opcodes = {
    OP_SET_JETTON_MINTER_ADDRESS: 0x40ee785c,
    OP_SET_GAMES: 0x6ed804ea,
    OP_REDIRECT_MESSAGE: 0x83449946,
    OP_RETURN_EXCESSES_BACK: 0xd53276db,
    OP_LITERALY_ANYTHING: 0x0a1b2c3d,
    OP_TRANSFER_NOTIFICATION_FOR_RECIPIENT: 0x7362d09c,
    OP_JETTON_USED: 0xd7610922,
} as const;

// Message types
export type SetJettonMinterAddress = {
    jettonMinterAddress: Address;
    jettonWalletCode: Cell;
};

export type JettonUsed = {
    jettonAmount: bigint; // coins
    data: Cell; // cell containing ship address
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
        .storeRef(msg.jettonWalletCode)
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

export function encodeJettonUsed(msg: JettonUsed): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_JETTON_USED, 32)
        .storeCoins(msg.jettonAmount)
        .storeRef(msg.data)
        .endCell();
}

