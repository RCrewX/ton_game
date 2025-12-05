import { toNano } from "@ton/core";

const BASIC_STORAGE_TAX = toNano("0.01");

const BASIC_SHIP_HP: bigint = 100n;
const MINT_TON_AMOUNT: bigint = toNano("0.1");

const var_mutableVar: bigint = 10n;
const val_immutableVal: bigint = 20n;

enum UniqueResult {
    SAFE_EXIT = 0,
    CRASH = 1,
    CONTINUE = 2,
}

enum MoveMode {
    LEFT = 0,
    UP = 1,
    RIGHT = 2,
    EXIT = 3,
}

export const Opcodes = {
    OP_INCREASE: 0x7e8764ef,
    OP_RESET: 0x3a752f06,
};