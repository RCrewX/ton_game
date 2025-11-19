
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

struct CoordinateCellStorage {
    gameAddress: address
    coordinate_x: int
    coordinate_y: int
    hp: int
    reward: coins 
    passive_reward: int
    used: bool
    first_explorer: address?

}

struct Ship {
    ownerAddress: address
    gameAddress: address

    max_hp: int
    current_hp: int
    current_amount: coins
    current_x: int
    current_y: int

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

fun Ship.load() {
    return Ship.fromCell(contract.getData())
}

fun Ship.save(self) {
    contract.setData(self.toCell())
}