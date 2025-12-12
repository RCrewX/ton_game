// structs.ts
import { Address, Cell, Builder } from '@ton/core';

// =======================
// Типы
// =======================

export enum UniqueResult {
    SAFE_EXIT = 0,
    CRASH = 1,
    CONTINUE = 2,
}

export enum MoveMode {
    LEFT = 0,
    UP = 1,
    RIGHT = 2,
    EXIT = 3,
}

// XY {
//   x: int256
//   y: uint256
// }
export type XY = {
    x: bigint;
    y: bigint;
};

// MoveData {
//   ship_hp: uint256
//   xy: XY
// }
export type MoveData = {
    ship_hp: bigint;
    xy: XY;
};

// GameFields {
//   xy: XY
//   hp: uint256
//   jettonAmount: coins
// }
export type GameFields = {
    xy: XY;
    hp: bigint;
    jettonAmount: bigint; // coins
};

// =======================
// store-функции
// =======================

// XY.toSlice:
// beginCell().storeInt(x, 256).storeUint(y, 256)
export function storeXY(builder: Builder, src: XY) {
    builder.storeInt(src.x, 256);
    builder.storeUint(src.y, 256);
}

// MoveData {
//   ship_hp: uint256
//   xy: XY
// }
export function storeMoveData(builder: Builder, src: MoveData) {
    builder.storeUint(src.ship_hp, 256);
    storeXY(builder, src.xy);
}

// GameFields {
//   xy: XY
//   hp: uint256
//   jettonAmount: coins
// }
export function storeGameFields(builder: Builder, src: GameFields) {
    storeXY(builder, src.xy);
    builder.storeUint(src.hp, 256);
    builder.storeCoins(src.jettonAmount);
}

// MoveMode — см. комментарий к типу.
// Если в Tolk, например, `uint8`, то так ок.
export function storeMoveMode(builder: Builder, src: MoveMode) {
    builder.storeUint(src, 8);
}

// UniqueResult — см. комментарий к типу.
// Сейчас считаем, что это просто Cell (отдельная ячейка).
export function storeUniqueResult(builder: Builder, src: UniqueResult) {
    builder.storeUint(src, 8);
}
