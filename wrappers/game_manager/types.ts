import { Address, beginCell, Cell, toNano } from '@ton/core';

// Gas costs from gas consumption tests (in TON)
// These match the constants in contracts/game_manager/static.tolk
export const GAS_COST_DEPLOY_JETTON = toNano("0.025"); // Estimated gas cost for DeployJetton
export const GAS_COST_SET_GAMES_INFO = toNano("0.020"); // Estimated gas cost for SetGamesInfo
export const GAS_COST_REDIRECT_MESSAGE = toNano("0.009"); // 0.0081816 + buffer
export const GAS_COST_SET_ALLOW_BURN = toNano("0.015"); // Estimated gas cost for SetAllowBurn
export const GAS_COST_REQUEST_BURN = toNano("0.015"); // Estimated gas cost for RequestBurn

// Opcodes
export const Opcodes = {
    OP_DEPLOY_JETTON: 0x5a1b2c3d,
    OP_SET_GAMES_INFO: 0x7b2c3d4e,
    OP_REDIRECT_MESSAGE: 0x83449946,
    OP_RETURN_EXCESSES_BACK: 0xd53276db,
    OP_LITERALY_ANYTHING: 0x0a1b2c3d,
    OP_TRANSFER_NOTIFICATION_FOR_RECIPIENT: 0x7362d09c,
    OP_JETTON_USED: 0xd7610922,
    OP_SET_ALLOW_BURN: 0x7a8b9c0d,
    OP_REQUEST_BURN: 0x8b9c0d1e,
    OP_ASK_TO_BURN: 0x595f07bc,
} as const;

// Message types
export type JettonUsed = {
    jettonAmount: bigint; // coins
    data: Cell; // cell containing ship address
};

export type DeployJetton = {
    jettonMinterCode: Cell;
    jettonWalletCode: Cell;
    jettonContent: Cell; // content cell for jetton minter
};

export type GamesInfo = {
    active_game: Address;
    all_games: Cell;
};

export type SetGamesInfo = {
    gamesInfo: Cell; // Cell<GamesInfo>
};

export type RedirectMessage = {
    queryId: bigint;
    destination: Address;
    messageBody: Cell;
    forwardTonAmount: bigint;
};

export type SetAllowBurn = {
    allow_burn: boolean;
};

export type RequestBurn = {
    queryId: bigint;
    jettonAmount: bigint;
    sendExcessesTo: Address | null;
    customPayload: Cell | null;
};

// Encode functions
export function encodeDeployJetton(msg: DeployJetton): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_DEPLOY_JETTON, 32)
        .storeRef(msg.jettonMinterCode)
        .storeRef(msg.jettonWalletCode)
        .storeRef(msg.jettonContent)
        .endCell();
}

export function encodeSetGamesInfo(msg: SetGamesInfo): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_SET_GAMES_INFO, 32)
        .storeRef(msg.gamesInfo)
        .endCell();
}

export function encodeGamesInfo(gamesInfo: GamesInfo): Cell {
    return beginCell()
        .storeAddress(gamesInfo.active_game)
        .storeRef(gamesInfo.all_games)
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

export function encodeSetAllowBurn(msg: SetAllowBurn): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_SET_ALLOW_BURN, 32)
        .storeBit(msg.allow_burn)
        .endCell();
}

export function encodeRequestBurn(msg: RequestBurn): Cell {
    const cell = beginCell()
        .storeUint(Opcodes.OP_REQUEST_BURN, 32)
        .storeUint(msg.queryId, 64)
        .storeCoins(msg.jettonAmount);
    
    // Store optional address - Tolk Maybe address uses MsgAddress format
    // storeAddress handles null automatically (stores 0b00 for null, 0b10/0b11 + address for present)
    cell.storeAddress(msg.sendExcessesTo);
    
    // Store optional cell - Tolk Maybe cell format
    // Format: 1 bit flag (0=null, 1=present) + ref if present
    cell.storeMaybeRef(msg.customPayload);
    
    return cell.endCell();
}

