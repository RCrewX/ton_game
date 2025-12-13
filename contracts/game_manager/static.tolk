// Constants
const BASIC_STORAGE_TAX = ton("0.01");
const MINT_TON_AMOUNT: coins = ton("0.1");

// Gas costs from gas consumption tests (in TON)
// These are maximum expected costs for each operation
const GAS_COST_SET_JETTON_MINTER_ADDRESS: coins = ton("0.02"); // 0.018347201 + buffer
const GAS_COST_SET_GAMES: coins = ton("0.015"); // 0.0141708 + buffer
const GAS_COST_REDIRECT_MESSAGE: coins = ton("0.005"); // 0.0031816 + buffer

// Errors
const ERR_UNAUTHORIZED = 901;
const ERR_MESSAGE_VALUE_TOO_LOW = 904;  // Message value is too low (less than estimated gas cost)
const ERR_MISSING_REQUIRED_DATA = 906;  // Required data (like jettonMinterAddress) is null

//  Storage

struct GameManagerStorage {
    ownerAddress: address // multisig will be perfect
    jettonMinterAddress: address? // jetton minter address
    jettonWalletCode: cell? // jetton wallet code for address calculation
    games: cell? // Addresses of games, maybe stored differently
}


fun GameManagerStorage.load() {
    return GameManagerStorage.fromCell(contract.getData())
}

fun GameManagerStorage.save(self) {
    contract.setData(self.toCell())
}

// Messages


struct (0x1a2b3c4d) SetJettonMinterAddress {
    jettonMinterAddress: address
    jettonWalletCode: cell
}

struct (0x2a3b4c5d) SetGames {
    games: cell
}

struct (0x3b4c5d6e) RedirectMessage {
    queryId: uint64
    destination: address
    messageBody: cell
    forwardTonAmount: coins
}

// Forwarded from Game
struct (0x6b7c8d9e) ForwardMintRequest {
    receiver: address
    amount: coins
}

// Jetton transfer notification (from jetton wallet to GameManager)
struct (0x7362d09c) TransferNotificationForRecipient {
    queryId: uint64
    jettonAmount: coins
    transferInitiator: address?
    forwardPayload: ForwardPayloadRemainder
}

// From GameManager to Game
struct (0x8b9cad0e) UpgradeShipRequest {
    shipAddress: address
    hpIncrease: uint256
}

// Jetton message structures (from jetton project, redefined here for forwarding)
type ForwardPayloadRemainder = RemainingBitsAndRefs

struct (0x178d4519) InternalTransferStep {
    queryId: uint64
    jettonAmount: coins
    transferInitiator: address? // is null when minting
    sendExcessesTo: address?
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

struct (0x00000015) MintNewJettons {
    queryId: uint64
    mintRecipient: address
    tonAmount: coins
    internalTransferMsg: Cell<InternalTransferStep>
}

type AnyMessage = ReturnExcessesBack | LiteralyAnything

struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

struct (0x0a1b2c3d) LiteralyAnything {
    queryId: uint64
}

fun empty_cell() : cell {
    return beginCell().endCell();
}

fun reserveValue(msgValue: coins, delta: coins = 0) {
    val base = (contract.getOriginalBalance() - msgValue) + BASIC_STORAGE_TAX;
    reserveToncoinsOnBalance(base + delta, RESERVE_MODE_EXACT_AMOUNT);
}

fun calcDeployedGameManager(
    ownerAddress: address,
    gameManagerCode: cell,
): AutoDeployAddress {
    val initStorage: GameManagerStorage = {
        ownerAddress,
        jettonMinterAddress: null,
        jettonWalletCode: null,
        games: null,
    };
    return {
        stateInit: {
            code: gameManagerCode,
            data: initStorage.toCell()
        }
    }
}

fun calcAddressOfGameManager(
    ownerAddress: address,
    gameManagerCode: cell,
): address {
    val gameManagerDeployed = calcDeployedGameManager(ownerAddress, gameManagerCode);
    return gameManagerDeployed.calculateAddress();
}

// Jetton wallet address calculation (redefined to avoid cross-project dependencies)
fun calcDeployedJettonWallet(ownerAddress: address, minterAddress: address, jettonWalletCode: cell): AutoDeployAddress {
    val emptyWalletStorage = beginCell()
        .storeCoins(0) // jettonBalance
        .storeAddress(ownerAddress) // ownerAddress
        .storeAddress(minterAddress) // minterAddress
        .endCell();

    return {
        stateInit: {
            code: jettonWalletCode,
            data: emptyWalletStorage
        }
    }
}

fun calcAddressOfJettonWallet(ownerAddress: address, minterAddress: address, jettonWalletCode: cell): address {
    val jwDeployed = calcDeployedJettonWallet(ownerAddress, minterAddress, jettonWalletCode);
    return jwDeployed.calculateAddress()
}