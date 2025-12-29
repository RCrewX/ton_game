// TODO Use special types for HP and X and Y Coordinates (example: RemainingBitsAndRefs)
type Y_TYPE = uint256
type X_TYPE = int256
type HP_TYPE = Y_TYPE

// DOES NOT WORK YET, WAIT TOLK 1.3
// 
// Error: fatal: Assertion failed at /Users/inv/ton-wasm/ton/tolk/optimize.cpp:62: p_ > 0 && p_ <= l_ && q_ >= 0 && q_ <= optimize_depth && l_ <= optimize_depth
// 
// Use (x-x) for zero

const x_zero: X_TYPE = 0 as X_TYPE;
const y_zero: Y_TYPE = 0 as Y_TYPE;

struct XY {
    x: X_TYPE
    y: Y_TYPE
}

fun XY.toSlice(self): slice {
    return beginCell().storeInt(self.x, 256).storeUint(self.y, 256).toSlice();
}

fun XY.load(slice: slice): XY {
    return XY {
        x: slice.loadInt(256),
        y: slice.loadUint(256),
    }
}

struct FastTravelInfo {
    enrichedFuelAmount: coins
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