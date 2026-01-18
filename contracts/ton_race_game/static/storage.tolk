
import "structs"
import "constants"

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

