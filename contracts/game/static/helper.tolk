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
        movement_in_process: false,
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

// Helper function to encode TEP-62 NFT Transfer message
// TEP-62 uses MsgAddress format for optional addresses: 2 bits (0b00=null, 0b10=address)
fun encodeNFTTransfer(
    queryId: uint64,
    newOwner: address,
    responseDestination: address?,
    customPayload: cell?,
    forwardAmount: coins,
    forwardPayload: RemainingBitsAndRefs
): cell {
    var builder = beginCell()
        .storeUint(0x5fcc3d14, 32) // NFT Transfer opcode (TEP-62)
        .storeUint(queryId, 64) // query_id
        .storeAddress(newOwner); // new_owner (always present)
    
    // Encode optional response_destination using TEP-62 MsgAddress format
    // 2 bits: 0b00 = null, 0b10 = address (any workchain), 0b11 = address (masterchain)
    if (responseDestination != null) {
        val workchain = responseDestination!.getWorkchain();
        if (workchain == -1) {
            builder = builder.storeUint(3, 2); // 0b11 = masterchain
        } else {
            builder = builder.storeUint(2, 2); // 0b10 = any workchain
        }
        builder = builder.storeAddress(responseDestination!);
    } else {
        builder = builder.storeUint(0, 2); // 0b00 = null
    }
    
    // Encode optional custom_payload: 1 bit (0=null, 1=cell) + cell if present
    if (customPayload != null) {
        builder = builder.storeUint(1, 1).storeRef(customPayload!);
    } else {
        builder = builder.storeUint(0, 1);
    }
    
    // forward_amount (VarUInteger 16)
    builder = builder.storeCoins(forwardAmount);
    
    // forward_payload (RemainingBitsAndRefs) - append remaining bits/refs from the slice
    // RemainingBitsAndRefs is a slice, so we can check and copy remaining data
    // For empty forwardPayload, we just end the cell (no additional bits/refs)
    // If there are remaining bits or refs, they would be appended here
    // In our case, forwardPayload is empty, so we just end the cell
    
    return builder.endCell();
}