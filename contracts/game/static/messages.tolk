import "structs"
import "constants"

type AnyMessage = ReturnExcessesBack | LiteralyAnything

// Jetton message structures (redefined to avoid cross-project dependencies)
type ForwardPayloadRemainder = RemainingBitsAndRefs

struct (0x0f8a7ea5) AskToTransfer {
    queryId: uint64
    jettonAmount: coins
    transferRecipient: address
    sendExcessesTo: address?
    customPayload: cell?
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

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

struct (0x9b0c1d2e) WithdrawTON {
    queryId: uint64
    recipient: address
    amount: coins
}

struct (0x0c1d2e3f) WithdrawJetton {
    queryId: uint64
    jettonWalletAddress: address
    recipient: address
    amount: coins
    forwardTonAmount: coins
}


//  To Ship

struct (0x3a4b5c6d) MoveEnd {
    result: UniqueResult
    gameFields: GameFields
}

struct (0x4a5b6c7d) RequestToMove {
    mode: MoveMode
}

struct (0x9a8b9cad) ShipUpgrade {
    hpIncrease: uint256
}

// To Game

struct (0x5a6b7c8d) RequestMint {
    receiver: address
    amount: coins
    ship: address
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

// To GameManager
struct (0x6b7c8d9e) ForwardMintRequest {
    receiver: address
    amount: coins
}

// From GameManager to Game
struct (0x8b9cad0e) UpgradeShipRequest {
    shipAddress: address
    hpIncrease: uint256
}
