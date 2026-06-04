// ShipSession — a purpose-built, CONSTRAINED Wallet-v5 (W5R1) extension.
//
// Goal of the spike: let an ephemeral browser "session key" authorize ONLY ship
// MOVE/EXIT actions for ONE ship, with NO owner-wallet signature per move, while
// being PROVABLY unable to do anything else (no draining, no other targets, no
// other opcodes, no add/remove-extension, time-boxed, replay-protected, budgeted).
//
// The crypto core (Ed25519 verify + seqno replay + validUntil) is modelled on the
// repo's `subcontract` external entrypoint, but stripped down to a single fixed
// action and HARDENED against the subcontract's cross-instance signed-replay bug:
// the signed inner here BINDS this contract's own address + the ship address, so a
// signature can never be replayed onto a different ShipSession instance.

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const BASIC_STORAGE_TAX = ton("0.01");        // storage floor — never drop below this
const GAS_MARGIN: coins = ton("0.02");        // compute margin for the external
const TRIGGER_GAS: coins = ton("0.05");       // value of the extn hop ShipSession -> wallet
                                              // (the MOVE value itself is paid by the WALLET)

// Wallet-v5r1 wire-format tags (verified byte-exact against @ton/ton + @ton/core
// in node_modules: WalletContractV5R1.OpCodes.auth_extension and OutList serializers).
const W5_AUTH_EXTENSION: uint32 = 0x6578746e;   // "extn" — extension-auth internal request
const W5_ACTION_SEND_MSG: uint32 = 0x0ec3c86d;  // action_send_msg#0ec3c86d
const W5_ACTION_SEND_MODE: uint8 = 1;           // SEND_MODE_PAY_FEES_SEPARATELY (ship gets full value)

// The game's move opcode (must match contracts/ton_race_game/static/messages.tolk:108).
const OP_REQUEST_TO_MOVE: uint32 = 0xf2a70b07;
// MoveMode is a uint8 enum {LEFT=0, UP=1, RIGHT=2, EXIT=3}. The session may ONLY use these.
const MAX_MOVE_MODE: uint8 = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Errors (950+ range, isolated from game 901-937 and subcontract 901-932)
// ─────────────────────────────────────────────────────────────────────────────
const ERR_INVALID_SIGNATURE = 950;     // not signed by the session public key
const ERR_BAD_SEQNO = 951;             // replayed / out-of-order seqno
const ERR_EXPIRED = 952;               // per-request validUntil passed
const ERR_SESSION_EXPIRED = 953;       // whole-session expiresAt passed (time-box)
const ERR_WRONG_TARGET = 954;          // inner.shipAddress != stored ship  (target binding)
const ERR_WRONG_BINDING = 955;         // inner.selfAddress != this contract (instance binding)
const ERR_INVALID_MOVE_MODE = 956;     // moveMode not in {LEFT,UP,RIGHT,EXIT}
const ERR_BUDGET_EXHAUSTED = 957;      // movesRemaining == 0
const ERR_INSUFFICIENT_FLOAT = 958;    // not enough TON float for the trigger hop
const ERR_INVALID_OWNER_SENDER = 959;  // internal control msg not from the owner wallet

// ─────────────────────────────────────────────────────────────────────────────
// Storage — constrained by construction. None of these can be changed by a
// session-key holder; only the owner (install / remove_extension) sets them.
// ─────────────────────────────────────────────────────────────────────────────
struct ShipSessionStorage {
    ownerWallet: address       // the W5 wallet this extension is installed on
    shipAddress: address       // the ONE ship this session may move
    sessionPublicKey: uint256  // ephemeral browser key authorized for this session
    expiresAt: uint32          // session time-box (unix seconds)
    seqno: uint32              // anti-replay counter
    moveValue: coins           // fixed value forwarded per move (the per-move cap)
    movesRemaining: uint32     // remaining move budget
}

fun ShipSessionStorage.load() {
    return ShipSessionStorage.fromCell(contract.getData())
}

fun ShipSessionStorage.save(self) {
    contract.setData(self.toCell())
}

// ─────────────────────────────────────────────────────────────────────────────
// Signed external payload.
// The session key signs the HASH of `inner`. `inner` binds target + this very
// instance, so a signature is useless on any other ship or any other ShipSession.
// ─────────────────────────────────────────────────────────────────────────────
struct SessionInner {
    seqno: uint32
    validUntil: uint32
    moveMode: uint8
    shipAddress: address     // must equal storage.shipAddress
    selfAddress: address     // must equal this contract's address (anti cross-instance replay)
}

struct ExternalEnvelope {
    signature: bits512  // Ed25519 over inner.hash()
    inner: cell         // referenced SessionInner cell (its hash is what gets signed)
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal control message: owner-only hard revoke (defense in depth; the primary
// revoke is remove_extension on the wallet). Opcode "rvke".
// ─────────────────────────────────────────────────────────────────────────────
struct (0x72766b65) RevokeSession {
    queryId: uint64
}

// ─────────────────────────────────────────────────────────────────────────────
// EXACT-amount storage reserve (same pattern as every other contract in the repo).
// ─────────────────────────────────────────────────────────────────────────────
fun reserveValue(msgValue: coins, delta: coins = 0) {
    val base = (contract.getOriginalBalance() - msgValue) + BASIC_STORAGE_TAX;
    val reserveAmount = base + delta;
    var finalReserve: coins;
    if (reserveAmount < BASIC_STORAGE_TAX) {
        finalReserve = BASIC_STORAGE_TAX;
    } else {
        finalReserve = reserveAmount;
    }
    reserveToncoinsOnBalance(finalReserve, RESERVE_MODE_EXACT_AMOUNT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the wallet-v5r1 extension request body that, when sent by a REGISTERED
// extension, makes the WALLET emit exactly ONE message: RequestToMove(mode) to the
// fixed ship, with value = moveValue. Layout (byte-exact vs @ton/ton serializers):
//
//   extnBody:  extn#6578746e queryId:uint64
//              actions:(Maybe ^OutList) has_other_actions:(## 1)=0
//   OutList (1 send action):
//              prev:^(OutList empty) action_send_msg#0ec3c86d mode:uint8 out_msg:^MessageRelaxed
//   MessageRelaxed: int_msg_info$0 (addr_none src), dest=ship, value=moveValue,
//                   body = ^(RequestToMove{mode})
//
// Because EVERYTHING except `mode` is taken from storage here, a session-key holder
// has no field with which to change the destination, opcode, value, or to inject an
// add/remove-extension action. That is the safety: it is fixed in code, not trusted.
// ─────────────────────────────────────────────────────────────────────────────
fun buildExtnMoveBody(shipAddress: address, moveMode: uint8, moveValue: coins): cell {
    // The single allowed game message.
    val moveBody = beginCell()
        .storeUint(OP_REQUEST_TO_MOVE, 32)
        .storeUint(moveMode, 8)
        .endCell();

    // MessageRelaxed (internal, addr_none src, NoBounce, body as ref).
    val relaxed = beginCell()
        .storeUint(0, 1)                 // int_msg_info$0
        .storeUint(1, 1)                 // ihr_disabled = true
        .storeUint(0, 1)                 // bounce = false (NoBounce)
        .storeUint(0, 1)                 // bounced = false
        .storeUint(0, 2)                 // src = addr_none
        .storeAddress(shipAddress)       // dest
        .storeCoins(moveValue)           // value: grams
        .storeUint(0, 1)                 // value: empty extra-currencies dict
        .storeCoins(0)                   // ihr_fee
        .storeCoins(0)                   // fwd_fee
        .storeUint(0, 64)                // created_lt
        .storeUint(0, 32)                // created_at
        .storeUint(0, 1)                 // init: nothing (Maybe = 0)
        .storeUint(1, 1)                 // body: right (stored as ref)
        .storeRef(moveBody)
        .endCell();

    // OutList with a single send action: prev = empty OutList, then the action.
    val outList = beginCell()
        .storeRef(beginCell().endCell()) // prev: ^(OutList 0) = empty cell
        .storeUint(W5_ACTION_SEND_MSG, 32)
        .storeUint(W5_ACTION_SEND_MODE, 8)
        .storeRef(relaxed)
        .endCell();

    // The extension request: extn + queryId + Maybe^OutList + has_other_actions(0).
    return beginCell()
        .storeUint(W5_AUTH_EXTENSION, 32)
        .storeUint(0, 64)                // queryId
        .storeUint(1, 1)                 // Maybe ^OutList present
        .storeRef(outList)               // ^OutList
        .storeUint(0, 1)                 // has_other_actions = 0 (no extended actions)
        .endCell();
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic address calc (init storage at install time, seqno/budget set by owner).
// ─────────────────────────────────────────────────────────────────────────────
fun calcDeployedShipSession(
    ownerWallet: address,
    shipAddress: address,
    sessionPublicKey: uint256,
    expiresAt: uint32,
    moveValue: coins,
    movesRemaining: uint32,
    shipSessionCode: cell,
): AutoDeployAddress {
    val initStorage: ShipSessionStorage = {
        ownerWallet,
        shipAddress,
        sessionPublicKey,
        expiresAt,
        seqno: 0,
        moveValue,
        movesRemaining,
    };
    return {
        stateInit: {
            code: shipSessionCode,
            data: initStorage.toCell()
        }
    };
}
