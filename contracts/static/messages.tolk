enum MoveMode: uint8 {
    EXIT
    LEFT
    UP
    RIGHT
}

// Map



// CoordinateCell

// from user to ship
struct AskToMove {
    mode: uint8
}

// from ship to CC
// from CC to CC
struct Move {
    user: address
    mode: MoveMode
    ship_hp: int
    ship_x: int
    ship_y: int
}

// from CC to ship
struct MoveEnd {
    success: bool // may be int to make harder reward if bad exit
    cc_x: int // for sanity checks
    cc_y: int // for sanity checks

}

struct RequestMint {
    amount: int
}
// Ship