import "static/storage"

fun calcDeployedCoordinateCell(
    gameAddress: address,
    coordinate_x: int,
    coordinate_y: int,
    // hp: int
    ): AutoDeployAddress {
    val initStorage: CoordinateCellStorage = {
        coordinate_x,
        coordinate_y,
        gameAddress,
        hp: 0,
        used: false,
        first_explorer: null,
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
    coordinate_x: int,
    coordinate_y: int,
    // hp: int
    ) {
    val ccDeployed = calcDeployedCoordinateCell(gameAddress, coordinate_x, coordinate_y);
    return ccDeployed.calculateAddress()
}