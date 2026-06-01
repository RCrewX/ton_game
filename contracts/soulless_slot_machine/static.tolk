// Constants
const BASIC_STORAGE_TAX = ton("0.01");
const TRY_LUCK_REQUIRED_AMOUNT: coins = ton("1"); // Exact 1 TON required
const TRY_LUCK_MAX_AMOUNT: coins = ton("1.2"); // Threshold for returning excess
const DEFAULT_MINT_AMOUNT: coins = 100; // Default mint amount (100 jettons, in nanojettons it's 100)
const WIN_CHANCE_PERCENT: uint8 = 5; // 5% chance to win

// Gas costs
const GAS_COST_TRY_LUCK: coins = ton("0.06"); // Estimated gas for TryLuck
const GAS_COST_SET_MINT_AMOUNT: coins = ton("0.015"); // Estimated gas for SetMintAmount
const GAS_COST_REQUEST_MINT: coins = ton("0.22"); // Same as TON Race Game for forwarding mint
const GAS_COST_RETURN_EXCESS: coins = ton("0.01"); // Gas for returning excess

// Errors
const ERR_INVALID_OWNER_SENDER = 940; // Sender is not the owner (GameManager)
const ERR_INSUFFICIENT_TRY_LUCK_AMOUNT = 941; // TryLuck message value is less than 1 TON
const ERR_MESSAGE_VALUE_TOO_LOW = 942; // Message value is too low for operation

// Note: SEND_MODE constants from stdlib:
// SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE = 64 (carry remaining message value)
// SEND_MODE_CARRY_ALL_REMAINING_BALANCE = 128 (carry all remaining balance)
// SEND_MODE_IGNORE_ERRORS = 2
// Use send_mode=128 (CARRY_ALL_REMAINING_BALANCE) where we want to forward all excess balance
const SEND_MODE_CARRY_ALL_REMAINING_BALANCE: uint8 = 128;

// Storage
struct SSMStorage {
    ownerAddress: address // GameManager address
    mintAmount: coins // Amount of jettons to mint on win
}

fun SSMStorage.load() {
    return SSMStorage.fromCell(contract.getData())
}

fun SSMStorage.save(self) {
    contract.setData(self.toCell())
}

// Messages

type AnyMessage = ReturnExcessesBack | LiteralyAnything

struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

struct (0x0a1b2c3d) LiteralyAnything {
    queryId: uint64
}

// User sends this to try luck
struct (0xa1b2c3d4) TryLuck {
    queryId: uint64
}

// Owner (GameManager) can set mint amount
struct (0xb2c3d4e5) SetMintAmount {
    mintAmount: coins
}

// To GameManager (same as TON Race Game): inner reward request, wrapped in R1.
struct (0xf62ed009) ForwardMintRequest {
    receiver: address
    amount: coins
}

// Generic request envelope to the new dumb-pipe GameManager. GM forwards `data`
// (opaque to it) to the Retranslator. Opcode must match game_manager/static.tolk.
struct (0x52310001) R1 {
    data: cell
}

fun empty_cell(): cell {
    return beginCell().endCell();
}

fun reserveValue(msgValue: coins, delta: coins = 0) {
    val base = (contract.getOriginalBalance() - msgValue) + BASIC_STORAGE_TAX;
    reserveToncoinsOnBalance(base + delta, RESERVE_MODE_EXACT_AMOUNT);
}

// Calculate deployed SSM address
fun calcDeployedSSM(
    ownerAddress: address,
    ssmCode: cell,
): AutoDeployAddress {
    val initStorage: SSMStorage = {
        ownerAddress,
        mintAmount: DEFAULT_MINT_AMOUNT,
    };
    return {
        stateInit: {
            code: ssmCode,
            data: initStorage.toCell()
        }
    }
}

fun calcAddressOfSSM(
    ownerAddress: address,
    ssmCode: cell,
): address {
    val ssmDeployed = calcDeployedSSM(ownerAddress, ssmCode);
    return ssmDeployed.calculateAddress();
}
