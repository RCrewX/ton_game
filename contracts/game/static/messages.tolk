import "structs"
import "constants"

type AnyMessage = ReturnExcessesBack | LiteralyAnything

struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

struct (0x0a1b2c3d) LiteralyAnything {
    queryId: uint64
}


// To Coordinate Cell


struct (0x1a2b3c4d) MoveShipToCC {
    user: address
    ship_hp: uint256
    mode: MoveMode
}

struct (0x2a3b4c5d) Move {
    user: address
    mode: MoveMode
    moveData: Cell<MoveData>
}


//  To Ship

struct (0x3a4b5c6d) MoveEnd {
    result: UniqueResult
    gameFields: GameFields
}

struct (0x4a5b6c7d) RequestToMove {
    mode: MoveMode
}

// To Game

struct (0x5a6b7c8d) RequestMint {
    receiver: address
    amount: coins
    proof: Proof
}

struct (0x6a7b8c9d) RequestShipAddress {
    userAddress: address
}

struct (0x7a8b9cad) RequestCoordinateCellAddress {
    xy: XY
}

struct (0x8a9bacbd) ResponseAddress {
    requestedAddress: address 
}

// To GameManager (proof already verified by Game)
struct (0x6b7c8d9e) ForwardMintRequest {
    receiver: address
    amount: coins
}
