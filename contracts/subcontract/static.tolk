// Constants
const BASIC_STORAGE_TAX = ton("0.01");
const EXCESS_THRESHOLD = ton("0.5"); // Minimum excess amount to forward to owner

// Gas costs from gas consumption tests (in TON)
// These are maximum expected costs for each operation
const GAS_COST_FORWARD: coins = ton("0.005"); // 0.0031816 + buffer
const GAS_COST_FORWARD_WITH_INIT: coins = ton("0.01"); // Higher cost for deploy messages
const GAS_COST_WITHDRAW: coins = ton("0.005"); // Gas cost for withdraw operation

// Errors
const ERR_UNAUTHORIZED = 901;
const ERR_MESSAGE_VALUE_TOO_LOW = 904;  // Message value is too low (less than estimated gas cost)

// Storage

struct SubcontractStorage {
    ownerAddress: address
    id: uint256
}

fun SubcontractStorage.load() {
    return SubcontractStorage.fromCell(contract.getData())
}

fun SubcontractStorage.save(self) {
    contract.setData(self.toCell())
}

// Messages

// Forward message without stateInit (no deploy)
struct (0x3b4c5d6e) Forward {
    queryId: uint64
    destination: address
    forwardTonAmount: coins
    bounce: bool  // true = Bounce, false = NoBounce
    sendMode: uint8
    messageBody: cell
}

// Forward message with stateInit (for deploy)
struct (0x4c5d6e7f) ForwardWithInit {
    queryId: uint64
    destination: address
    forwardTonAmount: coins
    sendMode: uint8
    stateInit: cell  // StateInit cell for contract deployment
    messageBody: cell
}

// Withdraw message - owner can withdraw all funds (leaving BASIC_STORAGE_TAX for gas safety)
struct (0x5d6e7f8a) Withdraw {
    queryId: uint64
}

// Excess message (from jetton transfers or other operations)
struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

fun reserveValue(msgValue: coins, delta: coins = 0) {
    val base = (contract.getOriginalBalance() - msgValue) + BASIC_STORAGE_TAX;
    val reserveAmount = base + delta;
    // Ensure reserve is at least BASIC_STORAGE_TAX (can't reserve negative or too low)
    var finalReserve: coins;
    if (reserveAmount < BASIC_STORAGE_TAX) {
        finalReserve = BASIC_STORAGE_TAX;
    } else {
        finalReserve = reserveAmount;
    }
    reserveToncoinsOnBalance(finalReserve, RESERVE_MODE_EXACT_AMOUNT);
}

fun calcDeployedSubcontract(
    ownerAddress: address,
    id: uint256,
    subcontractCode: cell,
): AutoDeployAddress {
    val initStorage: SubcontractStorage = {
        ownerAddress,
        id,
    };
    return {
        stateInit: {
            code: subcontractCode,
            data: initStorage.toCell()
        }
    }
}

fun calcAddressOfSubcontract(
    ownerAddress: address,
    id: uint256,
    subcontractCode: cell,
): address {
    val subcontractDeployed = calcDeployedSubcontract(ownerAddress, id, subcontractCode);
    return subcontractDeployed.calculateAddress()
}

