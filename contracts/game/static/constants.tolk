

const BASIC_STORAGE_TAX = ton("0.01");

const BASIC_SHIP_HP: uint256 = 100;
const MINT_TON_AMOUNT: coins = ton("1");

const var_mutableVar: int = 10;
const val_immutableVal: int = 20;

enum UniqueResult {
    SAFE_EXIT
    CRASH
    CONTINUE
}

enum MoveMode: uint8 {
    LEFT
    UP
    RIGHT
    EXIT
}