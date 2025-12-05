import "structs"
import "constants"

type AnyMessage = ReturnExcessesBack | LiteralyAnything

struct ReturnExcessesBack {
    queryId: uint64
}

struct LiteralyAnything {
    queryId: uint64
}

// from ship to CC
struct MoveShipToCC {
    user: address
    ship_hp: uint256
    mode: MoveMode
}
// from CC to CC
struct Move {
    user: address
    mode: MoveMode
    moveData: Cell<MoveData>
}



// from CC to ship
struct MoveEnd {
    result: UniqueResult
    gameFields: GameFields
}




// Ship

// from user to ship
struct RequestToMove {
    mode: MoveMode
}



struct RequestMint {
    receiver: address
    amount: coins
    proof: Proof
}

struct RequestShipAddress {
    userAddress: address,
}
struct RequestCoordinateCellAddress {
    xy: XY
}

struct ResponseAddress {
    requestedAddress: address 
}

