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

// NFT Transfer message (TEP-62 standard)
// opcode: 0x5fcc3d14
struct (0x5fcc3d14) NFTTransfer {
    queryId: uint64
    newOwner: address
    responseDestination: address?
    customPayload: cell?
    forwardAmount: coins
    forwardPayload: RemainingBitsAndRefs
}

struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

struct (0x0a1b2c3d) LiteralyAnything {
    queryId: uint64
}


// To Coordinate Cell
struct (0x4b13d2f0) TravelToCC {
    user: address
    moveData: MoveData 
}

struct (0xeafb35a2) MoveShipToCC {
    user: address
    ship_hp: HP_TYPE
    mode: MoveMode
}

struct (0x6ecc3df6) Move {
    user: address
    mode: MoveMode
    moveData: MoveData
}

struct (0xe06f1de3) WithdrawTON {
    queryId: uint64
    recipient: address
    amount: coins
}

struct (0xb3cff37d) WithdrawJetton {
    queryId: uint64
    jettonWalletAddress: address
    recipient: address
    amount: coins
    forwardTonAmount: coins
}

struct (0x09e971a8) WithdrawNFT {
    queryId: uint64
    nftAddress: address
    recipient: address
    forwardTonAmount: coins
    responseDestination: address?
    customPayload: cell?
}

struct (0x7dbcd1dc) LaunchHardTravel {
    user: address
    ship_hp: HP_TYPE
    info: HardTravelInfo
}

struct (0x2f168b85) HardTravel {
    user: address
    ship_hp: HP_TYPE
    info: HardTravelInfo
    moveData: MoveData
    turnIndex: uint8 // 0-based; move we are about to process
    accumulatedJettonAmount: coins // rewards collected so far
}

//  To Ship

struct (0xb2a06139) MoveEnd {
    result: UniqueResult
    gameFields: GameFields
}

// From CoordinateCell to Ship when HardTravel ends (CRASH or CONTINUE). Carries accumulated jettons for correct 10% on CRASH.
struct (0x8e7f9a0b) HardTravelMoveEnd {
    result: UniqueResult
    gameFields: GameFields
}

struct (0xf2a70b07) RequestToMove {
    mode: MoveMode
}

struct (0x8d2f1ca4) RequestToFastTravel {
    xy: XY
}

struct (0x18dd41ae) RequestToHardTravel {
    info: HardTravelInfo
}




struct (0x7d37523d) ShipUpgrade {
    hpIncrease: HP_TYPE
}

struct (0x5a1f0b21) FastTravelUpgrade {
    jettonAmount: coins
}

struct (0x6a3b8fdd) ResetShip {}

struct (0x53035644) RequestShipToMint {}
// To Game

struct (0xf5cc90ff) RequestMint {
    receiver: address
    amount: coins
}


struct (0xf0469aee) RequestShipAddress {
    userAddress: address
}

struct (0x213f6f8a) RequestCoordinateCellAddress {
    xy: XY
}

struct (0x33226fce) ResponseAddress {
    requestedAddress: address 
}

// To GameManager
struct (0xf62ed009) ForwardMintRequest {
    receiver: address
    amount: coins
}

// From GameManager to any Game
struct(0xd7610922) JettonUsed {
    jettonAmount: coins
    data: cell
}
