import "storage"
import "structs"
import "constants"
import "@stdlib/gas-payments"

fun empty_cell() : cell {
    return beginCell().endCell();
}

fun calcDeployedCoordinateCell(
    gameAddress: address,
    coordinate_x: int256,
    coordinate_y: uint256,
    coordinateCellCode: cell,
    shipCode: cell,
    ): AutoDeployAddress {
    val initStorage: CoordinateCellStorage = {
        gameAddress,
        xy: XY {x: coordinate_x, y: coordinate_y},
        opened: false,
        ccStorage: null,
        shipCode: shipCode,
    };

    return {
        stateInit: {
            code: coordinateCellCode,
            data: initStorage.toCell()
        }
    }
}

fun calcAddressOfCoordinateCell(
    gameAddress: address,
    coordinate_x: int256,
    coordinate_y: uint256,
    coordinateCellCode: cell,
    shipCode: cell,
    ): address {
    val ccDeployed = calcDeployedCoordinateCell(gameAddress, coordinate_x, coordinate_y, coordinateCellCode, shipCode);
    return ccDeployed.calculateAddress()
}



// Ship

fun calcDeployedShip(
    userAddress: address,
    gameAddress: address,
    shipCode: cell,
    coordinateCellCode: cell,
): AutoDeployAddress {
    val initStorage: ShipStorage = {
        userAddress,
        gameAddress,
        max_hp: 0,
        gameFields: null,
        coordinateCellCode: coordinateCellCode,
    };

    return {
        stateInit: {
            code: shipCode,
            data: initStorage.toCell()
        }
    }
}

fun calcAddressOfShip(
    userAddress: address,
    gameAddress: address,
    shipCode: cell,
    coordinateCellCode: cell,
    ): address {
    val shipDeployed = calcDeployedShip(userAddress, gameAddress, shipCode, coordinateCellCode);
    return shipDeployed.calculateAddress()
}

fun reserveValue(msgValue: coins, delta: coins = 0) {
    val base = (contract.getOriginalBalance() - msgValue) + BASIC_STORAGE_TAX;
    reserveToncoinsOnBalance(base + delta, RESERVE_MODE_EXACT_AMOUNT);
}


fun coordinate_plus_mode(x: int256, mode: MoveMode):int {
    match (mode) {
        MoveMode.LEFT => {return x-1}
        MoveMode.RIGHT => {return x+1}
        else => { return x },
    }
}