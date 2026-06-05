
import "structs"

struct GameV1Storage {
    managerAddress: address
    shipCode: cell // library cell will be perfect
    coordinateCellCode: cell // library cell will be perfect
}

struct CCStorage {
    hp: HP_TYPE
    jettonAmount: coins
    firstExplorer: address?
}

struct CoordinateCellStorage {
    gameAddress: address
    xy: XY
    opened: bool
    ccStorage: Cell<CCStorage>?
    shipCode: cell
}

struct ShipStorage {
    userAddress: address
    gameAddress: address
    max_hp: HP_TYPE
    gameFields: Cell<GameFields>?
    fastTravelInfo: Cell<FastTravelInfo>?
    coordinateCellCode: cell
    movement_in_process: bool
    pending_mint_amount: coins
    // Native session-key authorisation, in its OWN ref cell (appended at the END). A
    // one-time internal SetSessionKey (from userAddress) authorises an Ed25519 browser
    // key to sign external move/exit messages, bounded by expiry + a move budget. null
    // ref = no active session (the default on a fresh ship).
    sessionInfo: Cell<SessionInfo>?
}


fun GameV1Storage.load() {
    return GameV1Storage.fromCell(contract.getData())
}

fun GameV1Storage.save(self) {
    contract.setData(self.toCell())
}


fun CoordinateCellStorage.load() {
    return CoordinateCellStorage.fromCell(contract.getData())
}

fun CoordinateCellStorage.save(self) {
    contract.setData(self.toCell())
}


fun ShipStorage.load() {
    return ShipStorage.fromCell(contract.getData())
}

fun ShipStorage.save(self) {
    contract.setData(self.toCell())
}

