// TODO Use special types for HP and X and Y Coordinates (example: RemainingBitsAndRefs)
type Y_TYPE = uint256
type X_TYPE = int256
type HP_TYPE = Y_TYPE

struct XY {
    x: X_TYPE
    y: Y_TYPE
}

fun XY.toSlice(self): slice {
    return beginCell().storeInt(self.x, 256).storeUint(self.y, 256).toSlice();
}

struct GameFields {
    xy: XY
    hp: HP_TYPE
    jettonAmount: coins 
}

struct MoveData {
    ship_hp: HP_TYPE
    xy: XY
}

struct RandomResult {
    hp: HP_TYPE
    jettonAmount: coins
}