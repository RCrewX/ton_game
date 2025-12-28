// Constants
const BASIC_STORAGE_TAX = ton("0.01");
const MINT_TON_AMOUNT: coins = ton("0.1");

// Gas costs from gas consumption tests (in TON)
// These are maximum expected costs for each operation (updated from test results)
const GAS_COST_SET_JETTON_MINTER_ADDRESS: coins = ton("0.019"); // 0.0184204 + buffer
const GAS_COST_SET_GAMES: coins = ton("0.015"); // 0.0141556 + buffer
const GAS_COST_REDIRECT_MESSAGE: coins = ton("0.009"); // 0.0081816 + buffer
const GAS_COST_SET_ALLOW_BURN: coins = ton("0.015"); // Estimated gas cost for SetAllowBurn
const GAS_COST_REQUEST_BURN: coins = ton("0.015"); // Estimated gas cost for RequestBurn

// Errors
const ERR_UNAUTHORIZED = 901;  // Generic unauthorized (kept for backward compatibility)
const ERR_MESSAGE_VALUE_TOO_LOW = 904;  // Message value is too low (less than estimated gas cost)
const ERR_MISSING_REQUIRED_DATA = 906;  // Required data (like jettonMinterAddress) is null

// GameManager-specific errors
const ERR_INVALID_OWNER_SENDER = 920;  // Sender is not the game manager's owner address
const ERR_INVALID_GAME_SENDER = 921;  // Sender is not a valid game address from games list
const ERR_JETTON_MINTER_NOT_SET = 922;  // Jetton minter address is not set (null)
const ERR_JETTON_WALLET_CODE_NOT_SET = 923;  // Jetton wallet code is not set (null)
const ERR_GAMES_NOT_SET = 924;  // Games list is not set (null)
const ERR_INVALID_JETTON_WALLET_SENDER = 925;  // Sender is not the expected jetton wallet address
const ERR_INVALID_GAME_ADDRESS = 926;  // Game address is null or invalid
const ERR_BURN_NOT_ALLOWED = 927;  // Burn is not allowed (allow_burn is false)

const SEND_MODE_CARRY_ALL_REMAINING_BALANCE: uint8 = 128;

const MIN_JETTON_USAGE_AMOUNT: coins = 5 as coins;

//  Storage

struct GameManagerStorage {
    ownerAddress: address // multisig will be perfect
    jettonMinterAddress: address? // jetton minter address
    jettonWalletCode: cell? // jetton wallet code for address calculation
    games: cell? // Addresses of games, maybe stored differently
    allow_burn: bool // Allow burn operations (default false)
}


fun GameManagerStorage.load() {
    return GameManagerStorage.fromCell(contract.getData())
}

fun GameManagerStorage.save(self) {
    contract.setData(self.toCell())
}

// Messages


struct (0x40ee785c) SetJettonMinterAddress {
    jettonMinterAddress: address
    jettonWalletCode: cell
}

struct (0x6ed804ea) SetGames {
    games: cell
}

struct (0x83449946) RedirectMessage {
    queryId: uint64
    destination: address
    messageBody: cell
    forwardTonAmount: coins
}

// Forwarded from Game
struct (0xf62ed009) ForwardMintRequest {
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


// From GameManager to any Game
struct(0xd7610922) JettonUsed {
    jettonAmount: coins
    data: cell
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

struct (0x7a8b9c0d) SetAllowBurn {
    allow_burn: bool
}

struct (0x8b9c0d1e) RequestBurn {
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: address?
    customPayload: cell?
}

// Jetton burn message (from jetton project, redefined here for forwarding)
struct (0x595f07bc) AskToBurn {
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: address?
    customPayload: cell?
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
        allow_burn: false,
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