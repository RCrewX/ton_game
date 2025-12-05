
import "structs"
import "constants"

// TODO move to another project
struct GameManagerStorage {
    ownerAddress: address // multisig will be perfect
    jettonMinterAddress: address
    games: cell // Addresses of games, maybe stored differently
}

struct GameV1Storage {
    managerAddress: address
    shipCode: cell // library cell will be perfect
    coordinateCellCode: cell // library cell will be perfect
}

struct CCStorage {
    hp: uint256
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
    max_hp: uint256
    gameFields: Cell<GameFields>?
    coordinateCellCode: cell
}


fun GameManagerStorage.load() {
    return GameManagerStorage.fromCell(contract.getData())
}

fun GameManagerStorage.save(self) {
    contract.setData(self.toCell())
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

