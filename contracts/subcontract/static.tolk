// Constants
const BASIC_STORAGE_TAX = ton("0.01");

// Gas costs from gas consumption tests (in TON)
// These are maximum expected costs for each operation
const GAS_COST_REDIRECT_MESSAGE: coins = ton("0.005"); // 0.0031816 + buffer

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

struct (0x3b4c5d6e) RedirectMessage {
    queryId: uint64
    destination: address
    messageBody: cell
    forwardTonAmount: coins
}

type AnyMessage = ReturnExcessesBack | LiteralyAnything

struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

struct (0x0a1b2c3d) LiteralyAnything {
    queryId: uint64
}

fun reserveValue(msgValue: coins, delta: coins = 0) {
    val base = (contract.getOriginalBalance() - msgValue) + BASIC_STORAGE_TAX;
    reserveToncoinsOnBalance(base + delta, RESERVE_MODE_EXACT_AMOUNT);
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

