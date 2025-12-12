import { toNano, TupleReader } from "@ton/core";

const BASIC_STORAGE_TAX = toNano("0.01");

const BASIC_SHIP_HP: bigint = 100n;
const MINT_TON_AMOUNT: bigint = toNano("0.1");

const var_mutableVar: bigint = 10n;
const val_immutableVal: bigint = 20n;



// messages.ts
import { Address, Cell, beginCell } from '@ton/core';
import {
    // Эти типы и store-функции должны быть реализованы в твоём ./structs.ts
    MoveMode,
    storeMoveMode,
    MoveData,
    storeMoveData,
    UniqueResult,
    storeUniqueResult,
    GameFields,
    storeGameFields,
    XY,
    storeXY,
} from './structs';

// -------------------------
// Opcodes (из Tolk-struct’ов)
// -------------------------

export const Opcodes = {
    OP_RETURN_EXCESSES_BACK: 0xd53276db,
    OP_LITERALY_ANYTHING: 0x0a1b2c3d,

    OP_MOVE_SHIP_TO_CC: 0x1a2b3c4d,
    OP_MOVE: 0x2a3b4c5d,
    OP_WITHDRAW_TON: 0x9b0c1d2e,
    OP_WITHDRAW_JETTON: 0x0c1d2e3f,

    OP_MOVE_END: 0x3a4b5c6d,
    OP_REQUEST_TO_MOVE: 0x4a5b6c7d,

    OP_REQUEST_MINT: 0x5a6b7c8d,
    OP_REQUEST_SHIP_ADDRESS: 0x6a7b8c9d,
    OP_REQUEST_COORDINATE_CELL_ADDRESS: 0x7a8b9cad,
    OP_RESPONSE_ADDRESS: 0x8a9bacbd,
    OP_FORWARD_MINT_REQUEST: 0x6b7c8d9e,
} as const;

export function loadGameFieldsOpt(stack: TupleReader): GameFields | null {
    // Для nullable многослотной структуры:
    // первые N слотов — поля (могут быть NULL, если всё значение = null),
    // последний слот — typeid (0 => null, иначе => not null)

    // Читаем поля как "optional" числа,
    // потому что в случае null там реально будут NULL.
    const x = stack.readBigNumberOpt();      // xy.x (int256)
    const y = stack.readBigNumberOpt();      // xy.y (uint256)
    const hp = stack.readBigNumberOpt();     // hp (uint256)
    const jettonAmount = stack.readBigNumberOpt(); // jettonAmount (coins/int)
    const typeId = stack.readBigNumber();    // последний слот — typeid

    // null-кейс: typeId == 0
    if (typeId === 0n) {
        return null;
    }

    // Если typeId != 0, все поля должны быть ненулевыми
    if (x === null || y === null || hp === null || jettonAmount === null) {
        throw new Error('Invalid GameFields? layout: typeId != 0, но какие-то поля NULL');
    }

    const xy: XY = { x, y };

    const gameFields: GameFields = {
        xy,
        hp,
        jettonAmount,
    };

    return gameFields;
}



// -------------------------
// Типы сообщений (TS-уровень)
// -------------------------

export type ReturnExcessesBack = {
    queryId: bigint; // uint64
};

export type LiteralyAnything = {
    queryId: bigint; // uint64
};

// To Coordinate Cell

export type MoveShipToCC = {
    user: Address;
    ship_hp: bigint; // uint256
    mode: MoveMode;
};

export type Move = {
    user: Address;
    mode: MoveMode;
    // В Tolk: Cell<MoveData> — здесь просто готовый Cell с сериализованным MoveData
    moveData: Cell;
};

export type WithdrawTON = {
    queryId: bigint; // uint64
    recipient: Address;
    amount: bigint; // coins
};

export type WithdrawJetton = {
    queryId: bigint; // uint64
    jettonWalletAddress: Address;
    recipient: Address;
    amount: bigint; // coins
    forwardTonAmount: bigint; // coins
};

// To Ship

export type MoveEnd = {
    result: UniqueResult;
    gameFields: GameFields;
};

export type RequestToMove = {
    mode: MoveMode;
};

// To Game

export type RequestMint = {
    receiver: Address;
    amount: bigint; // coins (нанотоны)
    ship: Address;
};

export type RequestShipAddress = {
    userAddress: Address;
};

export type RequestCoordinateCellAddress = {
    xy: XY;
};

export type ResponseAddress = {
    requestedAddress: Address;
};

// Удобный union, если захочешь матчить по $$type
export type AnyMessage =
    | ({ $$type: 'ReturnExcessesBack' } & ReturnExcessesBack)
    | ({ $$type: 'LiteralyAnything' } & LiteralyAnything)
    | ({ $$type: 'MoveShipToCC' } & MoveShipToCC)
    | ({ $$type: 'Move' } & Move)
    | ({ $$type: 'WithdrawTON' } & WithdrawTON)
    | ({ $$type: 'WithdrawJetton' } & WithdrawJetton)
    | ({ $$type: 'MoveEnd' } & MoveEnd)
    | ({ $$type: 'RequestToMove' } & RequestToMove)
    | ({ $$type: 'RequestMint' } & RequestMint)
    | ({ $$type: 'RequestShipAddress' } & RequestShipAddress)
    | ({ $$type: 'RequestCoordinateCellAddress' } & RequestCoordinateCellAddress)
    | ({ $$type: 'ResponseAddress' } & ResponseAddress);

// -------------------------
// encode-функции для body сообщений
// -------------------------
//
// Каждая функция возвращает Cell, который можно передавать
// в provider.internal(via, { body: encodeX(...) })
// -------------------------

export function encodeReturnExcessesBack(msg: ReturnExcessesBack): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_RETURN_EXCESSES_BACK, 32)
        .storeUint(msg.queryId, 64)
        .endCell();
}

export function encodeLiteralyAnything(msg: LiteralyAnything): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_LITERALY_ANYTHING, 32)
        .storeUint(msg.queryId, 64)
        .endCell();
}

// To Coordinate Cell

export function encodeMoveShipToCC(msg: MoveShipToCC): Cell {
    const b = beginCell();
    b.storeUint(Opcodes.OP_MOVE_SHIP_TO_CC, 32);
    b.storeAddress(msg.user);
    b.storeUint(msg.ship_hp, 256);
    storeMoveMode(b, msg.mode);
    return b.endCell();
}

export function encodeMove(msg: Move): Cell {
    const b = beginCell();
    b.storeUint(Opcodes.OP_MOVE, 32);
    b.storeAddress(msg.user);
    storeMoveMode(b, msg.mode);
    // Cell<MoveData> — считаем, что это ref на сериализованный MoveData
    b.storeRef(msg.moveData);
    return b.endCell();
}

export function encodeWithdrawTON(msg: WithdrawTON): Cell {
    const b = beginCell();
    b.storeUint(Opcodes.OP_WITHDRAW_TON, 32);
    b.storeUint(msg.queryId, 64);
    b.storeAddress(msg.recipient);
    b.storeCoins(msg.amount);
    return b.endCell();
}

export function encodeWithdrawJetton(msg: WithdrawJetton): Cell {
    const b = beginCell();
    b.storeUint(Opcodes.OP_WITHDRAW_JETTON, 32);
    b.storeUint(msg.queryId, 64);
    b.storeAddress(msg.jettonWalletAddress);
    b.storeAddress(msg.recipient);
    b.storeCoins(msg.amount);
    b.storeCoins(msg.forwardTonAmount);
    return b.endCell();
}

// To Ship

export function encodeMoveEnd(msg: MoveEnd): Cell {
    const b = beginCell();
    b.storeUint(Opcodes.OP_MOVE_END, 32);
    storeUniqueResult(b, msg.result);
    storeGameFields(b, msg.gameFields);
    return b.endCell();
}

export function encodeRequestToMove(msg: RequestToMove): Cell {
    const b = beginCell();
    b.storeUint(Opcodes.OP_REQUEST_TO_MOVE, 32);
    storeMoveMode(b, msg.mode);
    return b.endCell();
}

// To Game

export function encodeRequestMint(msg: RequestMint): Cell {
    const b = beginCell();
    b.storeUint(Opcodes.OP_REQUEST_MINT, 32);
    b.storeAddress(msg.receiver);
    b.storeCoins(msg.amount);
    b.storeAddress(msg.ship);
    return b.endCell();
}

export function encodeRequestShipAddress(msg: RequestShipAddress): Cell {
    const b = beginCell();
    b.storeUint(Opcodes.OP_REQUEST_SHIP_ADDRESS, 32);
    b.storeAddress(msg.userAddress);
    return b.endCell();
}

export function encodeRequestCoordinateCellAddress(msg: RequestCoordinateCellAddress): Cell {
    const b = beginCell();
    b.storeUint(Opcodes.OP_REQUEST_COORDINATE_CELL_ADDRESS, 32);
    storeXY(b, msg.xy);
    return b.endCell();
}

export function encodeResponseAddress(msg: ResponseAddress): Cell {
    const b = beginCell();
    b.storeUint(Opcodes.OP_RESPONSE_ADDRESS, 32);
    b.storeAddress(msg.requestedAddress);
    return b.endCell();
}

// -------------------------
// (опционально) универсальный encoder по $$type
// -------------------------

export function encodeAnyMessage(msg: AnyMessage): Cell {
    switch (msg.$$type) {
        case 'ReturnExcessesBack':
            return encodeReturnExcessesBack(msg);
        case 'LiteralyAnything':
            return encodeLiteralyAnything(msg);
        case 'MoveShipToCC':
            return encodeMoveShipToCC(msg);
        case 'Move':
            return encodeMove(msg);
        case 'WithdrawTON':
            return encodeWithdrawTON(msg);
        case 'WithdrawJetton':
            return encodeWithdrawJetton(msg);
        case 'MoveEnd':
            return encodeMoveEnd(msg);
        case 'RequestToMove':
            return encodeRequestToMove(msg);
        case 'RequestMint':
            return encodeRequestMint(msg);
        case 'RequestShipAddress':
            return encodeRequestShipAddress(msg);
        case 'RequestCoordinateCellAddress':
            return encodeRequestCoordinateCellAddress(msg);
        case 'ResponseAddress':
            return encodeResponseAddress(msg);
        default:
            // TS должен не дать сюда добраться, но на всякий случай:
            throw new Error('Unknown message type');
    }
}
