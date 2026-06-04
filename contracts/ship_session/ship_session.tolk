import "static"
import "@stdlib/gas-payments"

// ─────────────────────────────────────────────────────────────────────────────
// Internal messages. ShipSession deliberately accepts almost nothing on the
// internal path: plain top-ups (to fund the trigger-hop float) and an owner-only
// hard revoke. It NEVER forwards arbitrary internal messages.
// ─────────────────────────────────────────────────────────────────────────────
type AllowedMessagesToShipSession =
    | RevokeSession

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToShipSession.fromSlice(in.body);
    match (msg) {
        RevokeSession => {
            // Only the owner wallet may hard-revoke. Kills the session immediately:
            // no more moves can ever be authorized (expiry + budget both zeroed).
            var storage = lazy ShipSessionStorage.load();
            assert (in.senderAddress == storage.ownerWallet) throw ERR_INVALID_OWNER_SENDER;
            storage.expiresAt = 0;
            storage.movesRemaining = 0;
            storage.save();
            reserveValue(in.valueCoins);
        }
        else => {
            // Plain transfer / top-up: just keep it as float for trigger-hop gas.
            // Reserving keeps the storage floor intact.
            reserveValue(in.valueCoins);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// External entrypoint — the whole point of the extension.
// A session-key-signed request authorizes ONE bounded move. Every safety property
// is enforced HERE, before the wallet is ever asked to act.
// ─────────────────────────────────────────────────────────────────────────────
fun onExternalMessage(inMsg: slice) {
    // Cheap parse first — no acceptExternalMessage() until everything checks out,
    // so a malformed / unauthorized / expired request costs the contract nothing.
    val env = ExternalEnvelope.fromSlice(inMsg);
    val innerCell = env.inner;
    val signature = env.signature;

    var storage = lazy ShipSessionStorage.load();

    // 1) Signature must be from THIS session's public key (property 6).
    val hash = innerCell.hash();
    val signatureSlice = signature as slice;
    val ok = isSignatureValid(hash, signatureSlice, storage.sessionPublicKey);
    if (!ok) {
        throw ERR_INVALID_SIGNATURE;
    }

    val inner = SessionInner.fromCell(innerCell);

    // 2) Replay protection (property 5).
    assert (inner.seqno == storage.seqno) throw ERR_BAD_SEQNO;
    // 3) Per-request freshness (property 5).
    assert (blockchain.now() < inner.validUntil) throw ERR_EXPIRED;
    // 4) Whole-session time-box (property 5 / self-expiry).
    assert (blockchain.now() < storage.expiresAt) throw ERR_SESSION_EXPIRED;
    // 5) Target binding — can ONLY ever move the stored ship (property 1).
    assert (inner.shipAddress == storage.shipAddress) throw ERR_WRONG_TARGET;
    // 6) Instance binding — a signature is useless on any other ShipSession
    //    (fixes the subcontract cross-instance signed-replay weakness).
    assert (inner.selfAddress == contract.getAddress()) throw ERR_WRONG_BINDING;
    // 7) Move-mode bound — only LEFT/UP/RIGHT/EXIT (property 2).
    assert (inner.moveMode <= MAX_MOVE_MODE) throw ERR_INVALID_MOVE_MODE;
    // 8) Move budget (property 3 — bounded number of moves).
    assert (storage.movesRemaining > 0) throw ERR_BUDGET_EXHAUSTED;
    // 9) Must hold enough float for the trigger hop (the external carries no value).
    assert (contract.getOriginalBalance() >= TRIGGER_GAS + BASIC_STORAGE_TAX + GAS_MARGIN)
        throw ERR_INSUFFICIENT_FLOAT;

    // All checks passed — now pay for the external.
    acceptExternalMessage();

    // Bump seqno + consume one budget unit FIRST and commit (wallet pattern): this
    // makes replay impossible even if the outgoing send were to fail later.
    storage.seqno += 1;
    storage.movesRemaining -= 1;
    storage.save();
    commitContractDataAndActions();

    // The ONLY thing this contract can emit: an extn request to its own wallet,
    // whose single action is RequestToMove(mode) to the stored ship, value = cap.
    // moveValue is taken from storage, never from the request → value cap holds
    // (property 3). No extended actions → cannot add/remove extensions or disable
    // signature auth on the wallet (property 4).
    val extnBody = buildExtnMoveBody(storage.shipAddress, inner.moveMode, storage.moveValue);

    val out = createMessage({
        bounce: BounceMode.NoBounce,
        dest: storage.ownerWallet,
        value: TRIGGER_GAS,
        body: extnBody,
    });
    out.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Getters (used by wrappers/tests and the future client harness).
// ─────────────────────────────────────────────────────────────────────────────
get fun get_owner_wallet(): address {
    var storage = lazy ShipSessionStorage.load();
    return storage.ownerWallet;
}

get fun get_ship_address(): address {
    var storage = lazy ShipSessionStorage.load();
    return storage.shipAddress;
}

get fun get_session_public_key(): uint256 {
    var storage = lazy ShipSessionStorage.load();
    return storage.sessionPublicKey;
}

get fun get_expires_at(): uint32 {
    var storage = lazy ShipSessionStorage.load();
    return storage.expiresAt;
}

get fun get_seqno(): uint32 {
    var storage = lazy ShipSessionStorage.load();
    return storage.seqno;
}

get fun get_move_value(): coins {
    var storage = lazy ShipSessionStorage.load();
    return storage.moveValue;
}

get fun get_moves_remaining(): uint32 {
    var storage = lazy ShipSessionStorage.load();
    return storage.movesRemaining;
}

get fun tonBalance(): coins {
    return contract.getOriginalBalance();
}
