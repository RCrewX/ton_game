// Constants
const BASIC_STORAGE_TAX = ton("0.01");
const MINT_TON_AMOUNT: coins = ton("0.1");

// Errors
const ERR_UNAUTHORIZED = 901;

//  Storage

struct GameManagerStorage {
    ownerAddress: address // multisig will be perfect
    jettonMinterAddress: address? // jetton minter address
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
}

struct (0x2a3b4c5d) SetGames {
    games: cell
}

// Forwarded from Game (proof already verified by Game)
struct (0x6b7c8d9e) ForwardMintRequest {
    receiver: address
    amount: coins
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
        games: null,
    };
    return {
        stateInit: {
            code: gameManagerCode, // TODO: change to library cell
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