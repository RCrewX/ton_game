type ProofData = XY | address;

fun ProofData.toSlice(self):slice {
    match (self) {
        XY => {
            return self.toSlice();
        },
        address => {
            return self.toSlice();
        },
    }
}
struct Proof {
    mode: uint8 // if 0 then Cell and coordinates in check, if 1 then ship and userAddress is in check
    data: ProofData
    // the_adress: address
    // data: XY
}

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