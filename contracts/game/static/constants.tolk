

const BASIC_STORAGE_TAX = ton("0.01");

const BASIC_SHIP_HP: uint256 = 100;
const MINT_TON_AMOUNT: coins = ton("0.2");

// Gas costs from gas consumption tests (in TON)
// These are maximum expected costs for each operation
const GAS_COST_REQUEST_SHIP_ADDRESS: coins = ton("0.014"); // 0.0139108 + buffer
const GAS_COST_REQUEST_COORDINATE_CELL_ADDRESS: coins = ton("0.015"); // 0.0143492 + buffer
const GAS_COST_REQUEST_TO_MOVE: coins = ton("0.07"); // 0.068966401 + buffer

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