struct XY {
    x: int256
    y: uint256
}

fun XY.toSlice(self): slice {
    return beginCell().storeInt(self.x, 256).storeUint(self.y, 256).toSlice();
}

struct GameFields {
    xy: XY
    hp: uint256
    jettonAmount: coins 
}

struct MoveData {
    ship_hp: uint256
    xy: XY
}