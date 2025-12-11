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

// ProofData = XY | address
// Proof {
//   mode: uint8 // 0 -> XY, 1 -> address
//   data: ProofData
// }
export type Proof =
    | {
          mode: 0;
          data: XY;
      }
    | {
          mode: 1;
          data: Address;
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

// ProofData.toSlice(self):
//   XY      => self.toSlice()  (x:int256, y:uint256)
//   address => self.toSlice()
//
// Proof {
//   mode: uint8
//   data: ProofData
// }
export function storeProof(builder: Builder, src: Proof) {
    // mode
    builder.storeUint(src.mode, 8);

    if (src.mode === 0) {
        // data: XY
        storeXY(builder, src.data);
    } else if (src.mode === 1) {
        // data: address
        builder.storeAddress(src.data);
    } else {
        // На всякий случай, чтобы не получить разъезд сериализации
        throw new Error(`Invalid Proof.mode: ${0}`);
    }
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
