import "ssm_common"
import "static"

// =============================================================================
// SoullessSlotMachine (SSM) — a real slot machine.
//
//   * Native RUDA roll  : house keeps the deposit (it landed in GM's RUDA
//     wallet); rewards are MINTED fresh (burn-and-mint). Intake = JettonUsed
//     routed by R* to SSM. Reward token wins -> ForwardMintRequest; NFT wins ->
//     MintNft; loss -> only cashback.
//   * Custom jetton roll: ESCROW-and-RETURN on a fully separate code path. Intake
//     = a TEP-74 transfer-notification DIRECTLY from SSM's own custom wallet.
//     "tokens back" -> AskToTransfer the escrow back; NFT wins -> MintNft with
//     the custom master as origin; loss -> house keeps the escrow.
//
// Per roll, SSM deploys ephemeral SSMSlot contracts (one per reel). The roll
// context rides the message the whole way, so SSM keeps NO per-roll state.
// =============================================================================

type AllowedMessagesToSSM =
    | JettonUsed                       // native intake (from GM)
    | TransferNotificationForRecipient // custom intake (from SSM's own custom wallet)
    | RollResult                       // from the last slot
    | SetSsmConfig                     // owner (GM) config
    | ReturnExcessesBack
    | LiteralyAnything

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToSSM.fromSlice(in.body);
    var storage = lazy SSMStorage.load();

    match (msg) {

        // ---- NATIVE intake: GM delivered the R*-routed RUDA transfer-notification ----
        JettonUsed => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (isAllowedRudaAmount(msg.jettonAmount)) throw ERR_INVALID_RUDA_AMOUNT;
            assert (in.valueCoins >= MIN_ROLL_VALUE) throw ERR_INSUFFICIENT_ROLL_VALUE;

            val intake = RollIntakeData.fromCell(msg.data);
            val ctx: RollContext = {
                player: intake.player,
                stake: msg.jettonAmount,
                isNative: true,
                origin: storage.rudaMasterAddress,
                escrowWallet: contract.getAddress(), // unused on native path
                queryId: intake.queryId,
            };
            startRoll(storage, ctx, in.valueCoins);
        }

        // ---- CUSTOM intake: escrow notification straight from SSM's custom wallet ----
        // SEPARATE path. We cannot reverify the wallet code (decision 4: no stored
        // custom wallet code), so we TRUST the claimed master as origin. The escrow
        // is real (the tokens are now in SSM's wallet); payouts are bounded by it.
        TransferNotificationForRecipient => {
            assert (msg.jettonAmount == CUSTOM_ALLOWED_AMOUNT) throw ERR_INVALID_CUSTOM_AMOUNT;
            assert (in.valueCoins >= MIN_ROLL_VALUE) throw ERR_INSUFFICIENT_ROLL_VALUE;

            var fp: slice = msg.forwardPayload;
            assert (fp.remainingRefsCount() >= 1) throw ERR_BAD_FORWARD_PAYLOAD;
            val payload = CustomRollPayload.fromCell(fp.loadRef());

            val ctx: RollContext = {
                player: payload.player,
                stake: msg.jettonAmount,
                isNative: false,
                origin: payload.master,
                escrowWallet: in.senderAddress, // SSM's custom wallet — return escrow here
                queryId: payload.queryId,
            };
            startRoll(storage, ctx, in.valueCoins);
        }

        // ---- Roll completed: the last slot returned the 3-symbol result ----
        RollResult => {
            val lastSlot = calcAddressOfSlot(contract.getAddress(), NUM_REELS - 1, storage.ssmSlotCode);
            assert (in.senderAddress == lastSlot) throw ERR_INVALID_SLOT_RESULT_SENDER;

            val ctx = msg.ctx.load();
            reserveValue(in.valueCoins);
            settleReward(storage, ctx, msg.symbols);
        }

        // ---- Owner (GM) config ----
        SetSsmConfig => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_SET_CONFIG) throw ERR_MESSAGE_VALUE_TOO_LOW;
            storage.ssmSlotCode = msg.ssmSlotCode;
            storage.rudaMasterAddress = msg.rudaMasterAddress;
            storage.save();
            reserveValue(in.valueCoins);
            val back = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ReturnExcessesBack { queryId: 0 }
            });
            back.send(SEND_MODE_IGNORE_ERRORS + SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }

        ReturnExcessesBack => {
            reserveValue(in.valueCoins);
        }
        LiteralyAnything => {
            reserveValue(in.valueCoins);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

// Reserve storage, then deploy reel 0 carrying the whole remaining value into the
// chain. The value travels SSM -> slot0 -> slot1 -> slot2 -> SSM (RollResult).
fun startRoll(storage: SSMStorage, ctx: RollContext, msgValue: coins) {
    reserveValue(msgValue);
    val step: RollStep = {
        ctx: ctx.toCell(),
        symbols: 0,
    };
    val deployMsg = createMessage({
        bounce: BounceMode.NoBounce,
        dest: calcDeployedSlot(contract.getAddress(), 0, storage.ssmSlotCode),
        value: 0,
        body: step,
    });
    deployMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
}

// Map symbols -> outcome and emit the reward (bounded value) + cashback (the
// carry-all remainder) to the player. reserveValue() was already called by the
// RollResult arm before this runs.
fun settleReward(storage: SSMStorage, ctx: RollContext, symbols: int) {
    val outcome = computeOutcome(symbols, ctx.isNative, ctx.stake);

    // (a) custom escrow return — send the staked custom jetton back to the player
    //     via SSM's own custom wallet.
    if (outcome.returnEscrow) {
        val transfer: AskToTransfer = {
            queryId: ctx.queryId,
            jettonAmount: ctx.stake,
            transferRecipient: ctx.player,
            sendExcessesTo: ctx.player,
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: beginCell().toSlice(),
        };
        val m = createMessage({
            bounce: BounceMode.NoBounce,
            dest: ctx.escrowWallet,
            value: ESCROW_RETURN_BUDGET,
            body: transfer,
        });
        m.send(SEND_MODE_PAY_FEES_SEPARATELY);
    }

    // (b) RUDA mint — native token wins, and the +1 RUDA on custom 077. Routed
    //     through GM as a normal game reward (R1{ForwardMintRequest}).
    if (outcome.mintRudaAmount > 0) {
        val fmr: ForwardMintRequest = {
            receiver: ctx.player,
            amount: outcome.mintRudaAmount,
        };
        val r1: R1 = { data: fmr.toCell() };
        val m = createMessage({
            bounce: BounceMode.NoBounce,
            dest: storage.ownerAddress,
            value: RUDA_MINT_BUDGET,
            body: r1,
        });
        m.send(SEND_MODE_PAY_FEES_SEPARATELY);
    }

    // (c) NFT mint — origin distinguishes native vs custom; one shared collection.
    if (outcome.kind == OUT_NFT) {
        val content: NFTContent = {
            origin: ctx.origin,
            itemType: outcome.nftType,
            tier: outcome.nftTier,
        };
        val mint: MintNft = {
            receiver: ctx.player,
            content: content.toCell(),
        };
        val r1: R1 = { data: mint.toCell() };
        val m = createMessage({
            bounce: BounceMode.NoBounce,
            dest: storage.ownerAddress,
            value: NFT_REWARD_BUDGET,
            body: r1,
        });
        m.send(SEND_MODE_PAY_FEES_SEPARATELY);
    }

    // (d) cashback — hand the leftover TON back to the player (also the ONLY
    //     thing a loss produces).
    val cashback = createMessage({
        bounce: BounceMode.NoBounce,
        dest: ctx.player,
        value: 0,
        body: ReturnExcessesBack { queryId: ctx.queryId },
    });
    cashback.send(SEND_MODE_IGNORE_ERRORS + SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
}

// =============================================================================
//  Get-methods
// =============================================================================

get fun get_owner_address(): address {
    val storage = lazy SSMStorage.load();
    return storage.ownerAddress;
}

get fun get_ruda_master(): address {
    val storage = lazy SSMStorage.load();
    return storage.rudaMasterAddress;
}

get fun get_slot_code(): cell {
    val storage = lazy SSMStorage.load();
    return storage.ssmSlotCode;
}

get fun get_slot_address(reelIndex: int): address {
    val storage = lazy SSMStorage.load();
    return calcAddressOfSlot(contract.getAddress(), reelIndex, storage.ssmSlotCode);
}

// Pure reward mapping exposed for exhaustive unit testing of every table row.
// Returns (kind, nftType, nftTier, mintRudaAmount, returnEscrow).
get fun get_reward(symbols: int, isNative: bool, stake: coins): (int, int, int, coins, bool) {
    val outcome = computeOutcome(symbols, isNative, stake);
    return (outcome.kind, outcome.nftType as int, outcome.nftTier as int, outcome.mintRudaAmount, outcome.returnEscrow);
}
