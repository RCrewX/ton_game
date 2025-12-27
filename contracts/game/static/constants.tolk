

const BASIC_STORAGE_TAX = ton("0.01");

const BASIC_SHIP_HP: uint256 = 100;
const MINT_TON_AMOUNT: coins = ton("0.2");

// Gas costs from gas consumption tests (in TON)
// These are maximum expected costs for each operation (updated from test results)
const GAS_COST_REQUEST_SHIP_ADDRESS: coins = ton("0.015"); // From gas consumption test
const GAS_COST_REQUEST_COORDINATE_CELL_ADDRESS: coins = ton("0.015"); // From gas consumption test
const GAS_COST_REQUEST_TO_MOVE: coins = ton("0.06"); // 0.0589864 + buffer
const TODO_TOTAL_GAS_TO_MOVE = GAS_COST_REQUEST_TO_MOVE + GAS_COST_REQUEST_MINT + BASIC_STORAGE_TAX;
// Internal message gas costs (from test results, with buffer)
const GAS_COST_MOVE_SHIP_TO_CC: coins = ton("0.12"); // Ship -> CoordinateCell (MoveShipToCC) - includes storage + gas for Move (estimated from move flow)
const GAS_COST_MOVE: coins = ton("0.12"); // CoordinateCell -> CoordinateCell (Move) - includes storage (if new) + gas for MoveEnd (estimated from move flow)
const GAS_COST_MOVE_END: coins = ton("0.06"); // CoordinateCell -> Ship (MoveEnd) - just gas (estimated)
const GAS_COST_REQUEST_MINT: coins = ton("0.22"); // Ship -> Game (RequestMint) - includes MINT_TON_AMOUNT (0.2) + gas (~0.02)
const GAS_COST_FORWARD_MINT_REQUEST: coins = ton("0.06"); // Game -> GameManager (ForwardMintRequest) - just gas (estimated)
const GAS_COST_JETTON_USED: coins = ton("0.06"); // GameManager -> Game (JettonUsed) - just gas (estimated)
const GAS_COST_SHIP_UPGRADE: coins = ton("0.06"); // Game -> Ship (ShipUpgrade) - just gas (estimated)
const GAS_COST_TRANSFER_NOTIFICATION: coins = ton("0.06"); // JettonWallet -> GameManager (TransferNotificationForRecipient) - just gas (estimated)
const GAS_COST_WITHDRAW_JETTON: coins = ton("0.05"); // Gas for jetton wallet operations during withdrawal
const GAS_COST_WITHDRAW_NFT: coins = ton("0.05"); // Gas for NFT operations during withdrawal

// Note: SEND_MODE constants from stdlib:
// SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE = 64 (carry remaining message value)
// SEND_MODE_CARRY_ALL_REMAINING_BALANCE = 128 (carry all remaining balance)
// SEND_MODE_IGNORE_ERRORS = 2
// Use send_mode=128 (CARRY_ALL_REMAINING_BALANCE) where we want to forward all excess balance
const SEND_MODE_CARRY_ALL_REMAINING_BALANCE: uint8 = 128;

// WithdrawTON constants
const WITHDRAW_TON_MIN_BALANCE_MULTIPLIER: uint8 = 10; // minRequiredBalance = BASIC_STORAGE_TAX * 10

// Forward payload marker for jetton transfers
const FORWARD_PAYLOAD_MARKER: uint128 = 1;

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

enum SpecialType: uint8 {
    EMPTY
    LOW
    HIGH
    EXTRA
}