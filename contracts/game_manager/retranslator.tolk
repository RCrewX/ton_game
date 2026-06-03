import "static"

/*
Retranslator (R*) = swappable BRAIN.

Rationale: for further updates in game logic and new system logics (NFT/SBT
printers, new uses of jettons, etc.) we want a contract that can be replaced
WITHOUT recompiling/redeploying the GameManager (GM). GM is a stable pipe and the
sole on-chain authority; R* holds the registries, validates, computes recipients,
and tells GM what to emit.

Wire protocol (defined in static.tolk):
    R1 - anyone -> GM
    R2 - GM -> R*   (GM attests the initiator; R2.data is opaque to GM)
    R3 - R* -> GM   (GM forwards R3.data to R3.recipient)
    R4 - GM -> recipient (just a send, no struct)

Classic flow:
    anyone -[R1]-> GM -[R2]-> R*  (verify + logic) -[R3]-> GM -[R4]-> recipient

The R2 arm parses the inner request and dispatches the implemented branches
(ForwardMintRequest mint, jetton-usage TransferNotification, owner RequestBurn).
R* never sends directly to a minter/wallet; it only returns R3 and GM sends outbound.
*/

const VERSION: uint64 = 1;

// TON forwarded to a printer ITEM at deploy/revoke. The collection keeps the rest
// of the carry-all balance; callers must attach enough to R1 (>= ~0.3 TON).
const PRINTER_ITEM_DEPLOY_AMOUNT: coins = ton("0.05"); // item storage + init gas
const PRINTER_REVOKE_FORWARD_AMOUNT: coins = ton("0.02"); // collection->item Revoke
// Full games-list walk for a printer mint is only attempted with enough gas.
const PRINTER_FULL_GAME_WALK_GAS: coins = ton("0.2");

// =============================================================================
//  R*-private registries & types (GM never imports these — decoupling invariant)
// =============================================================================

struct JettonInfo {
    jettonMinterAddress: address // jetton minter address
    jettonWalletCode: cell       // jetton wallet code for address calculation
}

struct GamesInfo {
    active_game: address;
    all_games: cell;
    // all_games: abstract list of all games, parsed during checkGame().
    // rules: first comes mode (0,1,2,3) (first expected mode is always 1 for each line)
    //   mode 1 - next comes address
    //   mode 0 - end of parse
    //   mode 2 - first reference parse for next line
    //   (nothing for mode 3 currently, but we use 2 bits)
    // examples: [1][:address][1][:address][0] (list of 2)
    //           [1][:address][1][:address][1][:address][2] (go to ref, expect next mode '1') [1][:address][1][:address][0]
    // First game in all_games is the current active_game.
}

// ToolsInfo v1 — `extra` gives forward-extensibility (add fields inside `extra`
// without changing this struct's head, so on-chain layout stays stable).
struct ToolsInfo {
    feeNumerator: uint16        // protocol fee numerator (0 = off)
    feeDenominator: uint16      // denominator (>= 1)
    feeCollector: address?      // null BY DEFAULT (no fee routing)
    nftPrinterAddress: address? // future NFT printer
    sbtPrinterAddress: address? // future SBT printer
    extra: cell?                // open-ended; add fields here without changing the head
}

// =============================================================================
//  R*-private output bodies (R* builds them, packs into R3.data; GM emits as R4)
// =============================================================================

struct (0xd7610922) JettonUsed {
    jettonAmount: coins
    data: cell
}

struct (0x178d4519) InternalTransferStep {
    queryId: uint64
    jettonAmount: coins
    transferInitiator: address? // is null when minting
    sendExcessesTo: address?
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

struct (0x00000015) MintNewJettons {
    queryId: uint64
    mintRecipient: address
    tonAmount: coins
    internalTransferMsg: Cell<InternalTransferStep>
}

struct (0x595f07bc) AskToBurn {
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: address?
    customPayload: cell?
}

// ---- Printer output bodies (built here, packed into R3.data, emitted by GM) ----
// These MUST stay byte-compatible with the printer collection message structs:
//   PrinterDeployNft        <-> contracts/printers/nft_printer/messages.tolk DeployNft
//   PrinterNftItemInit      <-> nft_printer NftItemInitAtDeployment (opcode-less payload)
//   PrinterDeploySbtn       <-> contracts/printers/sbt_printer/messages.tolk DeploySbtn
//   PrinterRevokeSbtnItem   <-> sbt_printer RevokeSbtnItem
// DeployNft and DeploySbtn share opcode 0x00000001 but target DIFFERENT printers,
// so there is no ambiguity (these are build-only; never parsed in a union).

struct PrinterNftItemInit {
    ownerAddress: address
    content: cell        // Cell<SnakeString> on the item side; opaque to R*
}

struct (0x00000001) PrinterDeployNft {
    queryId: uint64
    itemIndex: uint64
    attachTonAmount: coins
    initParams: Cell<PrinterNftItemInit>
}

struct (0x00000001) PrinterDeploySbtn {
    queryId: uint64
    ownerAddress: address
    index: uint256
    attachTonAmount: coins
    individualContent: cell
}

struct (0x00000004) PrinterRevokeSbtnItem {
    queryId: uint64
    itemAddress: address
}

// =============================================================================
//  R*-private inbound request bodies (wrapped inside R2.data)
// =============================================================================

struct (0xf62ed009) ForwardMintRequest {
    receiver: address
    amount: coins
}

struct (0x8b9c0d1e) RequestBurn {
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: address?
    customPayload: cell?
}

// ---- Printer recipe requests (wrapped inside R1.data -> R2.data) ----
// Opcodes verified unique vs the existing set. GM never parses these.
//   MintNft  : mint one transferable NFT to `receiver` (initiator = game OR owner)
//   MintSbt  : mint one soulbound SBT to `receiver`     (initiator = game OR owner)
//   RevokeSbt: revoke an SBT item by address            (initiator = OWNER ONLY)
struct (0x4d6e6674) MintNft {            // "Mnft"
    receiver: address
    content: cell                        // Cell<SnakeString> for the item; opaque to R*
}

struct (0x4d736274) MintSbt {            // "Msbt"
    receiver: address
    individualContent: cell              // set-once opaque content for the SBT item
}

struct (0x52766b73) RevokeSbt {          // "Rvks"
    queryId: uint64
    itemAddress: address                 // owner supplies the item address to revoke
}

// =============================================================================
//  ⚒  A N V I L  — NFT/SBT item editing (the on-chain workbench)
//
//  This is the SINGLE place where minted NFT/SBT items get re-forged. The whole
//  "allowed editings" policy lives here and ONLY here, so it can grow without
//  touching GM or the printers.
//
//  POLICY v1 (intentionally permissive): GM (the owner/admin) may edit EVERYTHING.
//  Admin -[R1{EditNft|EditSbt}]-> GM -[R2]-> R* (this ANVIL) -[R3]-> GM -[R4]->
//  printer collection -> item. The update is an OPAQUE `content` cell — R* never
//  inspects what's inside it (it just routes it). Finer-grained, field-level
//  "allowed editings" (e.g. only `tier`, only `tatoo`) will be added in THIS
//  section later, replacing the blanket owner check with per-field rules — still
//  without recompiling/redeploying GM.
//
//  Wire match: EditNft.content / EditSbt.content are forwarded verbatim into the
//  printer EditItem bodies below, whose opcodes mirror the printer collections:
//    PrinterEditNftItem (0x00000006) <-> nft_printer/messages.tolk EditNftItem
//    PrinterEditSbtItem (0x00000007) <-> sbt_printer/messages.tolk EditSbtItem
// =============================================================================

// ---- ANVIL inbound recipe requests (wrapped in R1.data -> R2.data) ----
struct (0x456e6674) EditNft {            // "Enft"
    itemAddress: address                 // which NFT item to re-forge
    content: cell                        // new Cell<NFTContent>; opaque to R*/GM
}

struct (0x45736274) EditSbt {            // "Esbt"
    itemAddress: address                 // which SBT item to re-forge
    content: cell                        // new Cell<SBTContent>; opaque to R*/GM
}

// ---- ANVIL output bodies (R* builds them, packs into R3.data; GM emits as R4) ----
struct (0x00000006) PrinterEditNftItem {
    queryId: uint64
    itemAddress: address
    newContent: cell
}

struct (0x00000007) PrinterEditSbtItem {
    queryId: uint64
    itemAddress: address
    newContent: cell
}

// =============================================================================
//  R*-private config messages (opcodes verified unique vs the existing set)
// =============================================================================

struct (0x53455401) SetJettonInfo {
    jettonInfo: Cell<JettonInfo>
}

struct (0x7b2c3d4e) SetGamesInfo {
    gamesInfo: Cell<GamesInfo>
}

struct (0x7a8b9c0d) SetAllowBurn {
    allow_burn: bool
}

struct (0x53455403) SetToolsInfo {
    toolsInfo: Cell<ToolsInfo>
}

// =============================================================================
//  Retranslator storage
// =============================================================================

struct RetranslatorStorage {
    gameManagerAddress: address
    ownerAddress: address          // for owner-only actions (e.g. burn)
    version: uint64
    active: bool
    allow_burn: bool
    jettonInfo: Cell<JettonInfo>?
    gamesInfo: Cell<GamesInfo>?
    toolsInfo: Cell<ToolsInfo>?
    // R*-tracked printer mint counters (the chosen index scheme, O-C). Global
    // monotonic indices: NFT items are keyed by (collection,index); SBT items by
    // (collection,owner,index) — a GLOBALLY unique index guarantees per-owner SBT
    // uniqueness without a per-owner dict. R* increments on each successful mint.
    nextNftIndex: uint64
    nextSbtIndex: uint256
}

fun RetranslatorStorage.load() {
    return RetranslatorStorage.fromCell(contract.getData())
}

fun RetranslatorStorage.save(self) {
    contract.setData(self.toCell())
}

// =============================================================================
//  Message unions
// =============================================================================

type AllowedMessagesToRetranslator =
    | SetJettonInfo
    | SetGamesInfo
    | SetAllowBurn
    | SetToolsInfo
    | R2
    | ReturnExcessesBack
    | LiteralyAnything

// Inner request, parsed out of R2.data.
type AllowedRequests =
    | ForwardMintRequest
    | TransferNotificationForRecipient
    | RequestBurn
    | MintNft
    | MintSbt
    | RevokeSbt
    | EditNft   // ⚒ ANVIL
    | EditSbt   // ⚒ ANVIL


fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToRetranslator.fromSlice(in.body);
    var storage = lazy RetranslatorStorage.load();
    match (msg) {

        // -------- config (relayed from GM; sender must be GM) --------
        SetJettonInfo => {
            assert (in.senderAddress == storage.gameManagerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_SET_JETTON_INFO) throw ERR_MESSAGE_VALUE_TOO_LOW;
            storage.jettonInfo = msg.jettonInfo;
            storage.save();
            reserveValue(in.valueCoins);
            returnExcessesToGameManager(storage.gameManagerAddress);
        }

        SetGamesInfo => {
            assert (in.senderAddress == storage.gameManagerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_SET_GAMES_INFO) throw ERR_MESSAGE_VALUE_TOO_LOW;

            val gamesInfo = msg.gamesInfo.load();
            // Validate that the first game in all_games is the active_game.
            var allGamesSlice = gamesInfo.all_games.beginParse();
            var firstMode: uint8 = 0;
            var hasFirstMode = false;
            try {
                firstMode = allGamesSlice.loadUint(2);
                hasFirstMode = true;
            } catch {
                hasFirstMode = false;
            }
            if (hasFirstMode && firstMode == 1) { // Mode 1 means an address follows
                var firstGameAddress: address = gamesInfo.active_game; // Initialize with active_game
                var hasAddress = false;
                try {
                    firstGameAddress = allGamesSlice.loadAddress();
                    hasAddress = true;
                } catch {
                    hasAddress = false;
                }
                if (hasAddress) {
                    assert (firstGameAddress == gamesInfo.active_game) throw ERR_INVALID_GAMES_INFO;
                }
            }

            storage.gamesInfo = msg.gamesInfo;
            storage.save();
            reserveValue(in.valueCoins);
            returnExcessesToGameManager(storage.gameManagerAddress);
        }

        SetAllowBurn => {
            assert (in.senderAddress == storage.gameManagerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_SET_ALLOW_BURN) throw ERR_MESSAGE_VALUE_TOO_LOW;
            storage.allow_burn = msg.allow_burn;
            storage.save();
            reserveValue(in.valueCoins);
            returnExcessesToGameManager(storage.gameManagerAddress);
        }

        SetToolsInfo => {
            assert (in.senderAddress == storage.gameManagerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_SET_TOOLS_INFO) throw ERR_MESSAGE_VALUE_TOO_LOW;
            storage.toolsInfo = msg.toolsInfo;
            storage.save();
            reserveValue(in.valueCoins);
            returnExcessesToGameManager(storage.gameManagerAddress);
        }

        // -------- the brain: GM -R2-> R* (shell + kill-switch only this job) --------
        R2 => {
            assert (in.senderAddress == storage.gameManagerAddress) throw ERR_INVALID_OWNER_SENDER;

            // Kill-switch: when inactive, bounce the value back to GM untouched.
            if (!storage.active) {
                reserveValue(in.valueCoins);
                val back = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.gameManagerAddress,
                    value: 0,
                    body: beginCell().endCell()
                });
                back.send(SEND_MODE_IGNORE_ERRORS + SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
                return;
            }

            // R2.initiator = who sent the original R1 (GM-attested).
            // R2.data = opaque request body; parse it to dispatch.
            val request = lazy AllowedRequests.fromSlice(msg.data.beginParse());
            match (request) {

                // A game earned a reward -> mint jettons to the player.
                // initiator must be a registered game. R* builds MintNewJettons and
                // tells GM to emit it to the jetton minter (GM is the minter admin).
                ForwardMintRequest => {
                    assert (storage.jettonInfo != null) throw ERR_JETTON_MINTER_NOT_SET;
                    val jettonInfo = storage.jettonInfo!.load();
                    assert (storage.gamesInfo != null) throw ERR_GAMES_NOT_SET;
                    val gamesInfo = storage.gamesInfo!.load();

                    // First check the active game (cheap); only walk the full list
                    // when enough gas was attached (it is more expensive).
                    val isActiveGame = (msg.initiator == gamesInfo.active_game);
                    if (!isActiveGame) {
                        assert (in.valueCoins >= ton("0.2")) throw ERR_INVALID_GAME_SENDER;
                        val gameIndex = checkGame(msg.initiator, gamesInfo.all_games);
                        assert (gameIndex != 0) throw ERR_GAME_NOT_FOUND;
                    }

                    // forwardPayload empty: the TransferNotification goes from the
                    // player's wallet to the player, not back to GM.
                    val forwardPayload: ForwardPayloadRemainder = beginCell().toSlice();
                    val forwardTonAmount = ton("0.05"); // enough for the notification
                    val internalTransferStep = InternalTransferStep {
                        queryId: 0,
                        jettonAmount: request.amount,
                        transferInitiator: null,        // null when minting
                        sendExcessesTo: request.receiver,
                        forwardTonAmount: forwardTonAmount,
                        forwardPayload: forwardPayload,
                    };
                    var dif = in.valueCoins - MINT_TON_AMOUNT - BASIC_STORAGE_TAX;
                    val mintNewJettons = MintNewJettons {
                        queryId: 0,
                        mintRecipient: request.receiver,
                        tonAmount: MINT_TON_AMOUNT + dif,
                        internalTransferMsg: internalTransferStep.toCell(),
                    };
                    reserveValue(in.valueCoins);
                    emitR3(storage.gameManagerAddress, jettonInfo.jettonMinterAddress, mintNewJettons.toCell());
                }

                // A player spent jettons (transfer notification arrived at GM's
                // native jetton wallet). R* verifies the wallet, decodes the
                // forwardPayload (game address + ship-usage data) and asks GM to
                // emit JettonUsed to that game.
                TransferNotificationForRecipient => {
                    assert (storage.jettonInfo != null) throw ERR_JETTON_MINTER_NOT_SET;
                    val jettonInfo = storage.jettonInfo!.load();
                    // initiator must be GM's OWN jetton wallet (owner == GM).
                    val expectedWalletAddress = calcAddressOfJettonWallet(
                        storage.gameManagerAddress, jettonInfo.jettonMinterAddress, jettonInfo.jettonWalletCode);
                    assert (msg.initiator == expectedWalletAddress) throw ERR_INVALID_JETTON_WALLET_SENDER;

                    // forwardPayload is RemainingBitsAndRefs: one ref to a payload
                    // cell that itself holds [gameAddress ref][data ref].
                    var forwardPayloadSlice: slice = request.forwardPayload;
                    if (forwardPayloadSlice.remainingRefsCount() < 1 ||
                        request.jettonAmount < MIN_JETTON_USAGE_AMOUNT) {
                        reserveValue(in.valueCoins);
                        sendEmptyBackToGameManager(storage.gameManagerAddress);
                        return;
                    }
                    val payloadCell = forwardPayloadSlice.loadRef();
                    var payloadSlice = payloadCell.beginParse();
                    if (payloadSlice.remainingRefsCount() < 2) {
                        reserveValue(in.valueCoins);
                        sendEmptyBackToGameManager(storage.gameManagerAddress);
                        return;
                    }
                    val gameAddressCell = payloadSlice.loadRef();
                    val gameAddress = gameAddressCell.beginParse().loadAddress();
                    val dataCell = payloadSlice.loadRef();

                    val jettonUsed = JettonUsed {
                        jettonAmount: request.jettonAmount,
                        data: dataCell,
                    };
                    reserveValue(in.valueCoins);
                    emitR3(storage.gameManagerAddress, gameAddress, jettonUsed.toCell());
                }

                // Owner-initiated burn of GM's native jettons. R* builds AskToBurn
                // and tells GM to emit it to GM's own jetton wallet.
                RequestBurn => {
                    assert (msg.initiator == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
                    assert (storage.allow_burn) throw ERR_BURN_NOT_ALLOWED;
                    assert (storage.jettonInfo != null) throw ERR_JETTON_MINTER_NOT_SET;
                    val jettonInfo = storage.jettonInfo!.load();
                    val gameManagerWalletAddress = calcAddressOfJettonWallet(
                        storage.gameManagerAddress, jettonInfo.jettonMinterAddress, jettonInfo.jettonWalletCode);
                    val askToBurn = AskToBurn {
                        queryId: request.queryId,
                        jettonAmount: request.jettonAmount,
                        sendExcessesTo: request.sendExcessesTo,
                        customPayload: request.customPayload,
                    };
                    reserveValue(in.valueCoins);
                    emitR3(storage.gameManagerAddress, gameManagerWalletAddress, askToBurn.toCell());
                }

                // Mint one TEP-62 NFT to `receiver` via the NFTPrinter.
                // Recipe policy v1: initiator = a registered game OR the owner.
                // R* assigns the global nextNftIndex and tells GM to emit DeployNft
                // to the printer (sender == admin == GM). [extension point: richer
                // recipe registry lands here without touching GM.]
                MintNft => {
                    assert (storage.toolsInfo != null) throw ERR_TOOLS_INFO_NOT_SET;
                    val toolsInfo = storage.toolsInfo!.load();
                    assert (toolsInfo.nftPrinterAddress != null) throw ERR_NFT_PRINTER_NOT_SET;
                    assertMintInitiatorAllowed(storage, msg.initiator, in.valueCoins);

                    val index = storage.nextNftIndex;
                    val initParams = PrinterNftItemInit {
                        ownerAddress: request.receiver,
                        content: request.content,
                    };
                    val deployNft = PrinterDeployNft {
                        queryId: 0,
                        itemIndex: index,
                        attachTonAmount: PRINTER_ITEM_DEPLOY_AMOUNT,
                        initParams: initParams.toCell(),
                    };
                    storage.nextNftIndex = index + 1;
                    storage.save();
                    reserveValue(in.valueCoins);
                    emitR3(storage.gameManagerAddress, toolsInfo.nftPrinterAddress!, deployNft.toCell());
                }

                // Mint one soulbound SBT to `receiver` via the SBTPrinter.
                // Recipe policy v1: OWNER/GM ONLY (games may create NFTs, NOT SBTs).
                // Global nextSbtIndex guarantees per-owner item uniqueness.
                MintSbt => {
                    assert (msg.initiator == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
                    assert (storage.toolsInfo != null) throw ERR_TOOLS_INFO_NOT_SET;
                    val toolsInfo = storage.toolsInfo!.load();
                    assert (toolsInfo.sbtPrinterAddress != null) throw ERR_SBT_PRINTER_NOT_SET;

                    val index = storage.nextSbtIndex;
                    val deploySbtn = PrinterDeploySbtn {
                        queryId: 0,
                        ownerAddress: request.receiver,
                        index: index,
                        attachTonAmount: PRINTER_ITEM_DEPLOY_AMOUNT,
                        individualContent: request.individualContent,
                    };
                    storage.nextSbtIndex = index + 1;
                    storage.save();
                    reserveValue(in.valueCoins);
                    emitR3(storage.gameManagerAddress, toolsInfo.sbtPrinterAddress!, deploySbtn.toCell());
                }

                // Revoke an SBT item. OWNER-ONLY (high-value). The owner supplies the
                // item address; R* tells GM to emit RevokeSbtnItem to the SBTPrinter,
                // which forwards Revoke to the item (item checks sender == collection).
                RevokeSbt => {
                    assert (msg.initiator == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
                    assert (storage.toolsInfo != null) throw ERR_TOOLS_INFO_NOT_SET;
                    val toolsInfo = storage.toolsInfo!.load();
                    assert (toolsInfo.sbtPrinterAddress != null) throw ERR_SBT_PRINTER_NOT_SET;

                    val revokeItem = PrinterRevokeSbtnItem {
                        queryId: request.queryId,
                        itemAddress: request.itemAddress,
                    };
                    reserveValue(in.valueCoins);
                    emitR3(storage.gameManagerAddress, toolsInfo.sbtPrinterAddress!, revokeItem.toCell());
                }

                // ----------------------------------------------------------------
                //  ⚒  ANVIL arms — edit an existing NFT/SBT item's content.
                //  Policy v1: OWNER/GM ONLY may edit (everything). R* forwards the
                //  opaque `content` cell to the printer collection, which forwards
                //  SetNftContent/SetSbtContent to the item. R* never parses content.
                //  Future field-level "allowed editings" replace the owner check here.
                // ----------------------------------------------------------------
                EditNft => {
                    assert (msg.initiator == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
                    assert (storage.toolsInfo != null) throw ERR_TOOLS_INFO_NOT_SET;
                    val toolsInfo = storage.toolsInfo!.load();
                    assert (toolsInfo.nftPrinterAddress != null) throw ERR_NFT_PRINTER_NOT_SET;

                    val editItem = PrinterEditNftItem {
                        queryId: 0,
                        itemAddress: request.itemAddress,
                        newContent: request.content,
                    };
                    reserveValue(in.valueCoins);
                    emitR3(storage.gameManagerAddress, toolsInfo.nftPrinterAddress!, editItem.toCell());
                }

                EditSbt => {
                    assert (msg.initiator == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
                    assert (storage.toolsInfo != null) throw ERR_TOOLS_INFO_NOT_SET;
                    val toolsInfo = storage.toolsInfo!.load();
                    assert (toolsInfo.sbtPrinterAddress != null) throw ERR_SBT_PRINTER_NOT_SET;

                    val editItem = PrinterEditSbtItem {
                        queryId: 0,
                        itemAddress: request.itemAddress,
                        newContent: request.content,
                    };
                    reserveValue(in.valueCoins);
                    emitR3(storage.gameManagerAddress, toolsInfo.sbtPrinterAddress!, editItem.toCell());
                }
            }
        }

        ReturnExcessesBack => {
            reserveValue(in.valueCoins);
            val cashbackMessage = createMessage({
                bounce: BounceMode.NoBounce,
                dest: storage.gameManagerAddress,
                value: 0,
                body: beginCell().endCell() // Empty body for simple transfer
            });
            cashbackMessage.send(SEND_MODE_IGNORE_ERRORS + SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        LiteralyAnything => {
            reserveValue(in.valueCoins);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun returnExcessesToGameManager(gameManagerAddress: address) {
    val responseMsg = createMessage({
        bounce: BounceMode.NoBounce,
        dest: gameManagerAddress,
        value: 0,
        body: ReturnExcessesBack {
            queryId: 0
        }
    });
    responseMsg.send(SEND_MODE_IGNORE_ERRORS + SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
}

// R* -[R3]-> GM. GM forwards `data` to `recipient` as R4. Carry-all so the whole
// remaining value travels with the reply.
fun emitR3(gameManagerAddress: address, recipient: address, data: cell) {
    val r3 = createMessage({
        bounce: BounceMode.NoBounce,
        dest: gameManagerAddress,
        value: 0,
        body: R3 {
            recipient: recipient,
            data: data,
        }
    });
    r3.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
}

// Abort path: nothing to emit, just hand the remaining value back to GM.
fun sendEmptyBackToGameManager(gameManagerAddress: address) {
    val back = createMessage({
        bounce: BounceMode.NoBounce,
        dest: gameManagerAddress,
        value: 0,
        body: beginCell().endCell()
    });
    back.send(SEND_MODE_IGNORE_ERRORS + SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
}

// =============================================================================
//  R*-private helpers
// =============================================================================

// Jetton wallet address calculation (redefined to avoid cross-project dependencies)
fun calcDeployedJettonWallet(ownerAddress: address, minterAddress: address, jettonWalletCode: cell): AutoDeployAddress {
    val emptyWalletStorage = beginCell()
        .storeCoins(0) // jettonBalance
        .storeAddress(ownerAddress) // ownerAddress
        .storeAddress(minterAddress) // minterAddress
        .endCell();

    return {
        stateInit: {
            code: jettonWalletCode,
            data: emptyWalletStorage
        }
    }
}

fun calcAddressOfJettonWallet(ownerAddress: address, minterAddress: address, jettonWalletCode: cell): address {
    val jwDeployed = calcDeployedJettonWallet(ownerAddress, minterAddress, jettonWalletCode);
    return jwDeployed.calculateAddress()
}

fun checkGame(gameAddress: address, all_games: cell): uint16 {
    // Parse through all_games as described in GamesInfo rules and return index.
    // Skip the first game (this runs only if gameAddress != active_game, and the
    // first game in all_games is the active_game). Return 0 if not found,
    // otherwise a 1-based index.
    var slice = all_games.beginParse();
    var index: uint16 = 0;

    // Skip first game (active_game) - try to load mode and address
    var firstMode: uint8 = 0;
    var hasFirst = false;
    try {
        firstMode = slice.loadUint(2);
        if (firstMode == 1) {
            val _firstAddress = slice.loadAddress(); // Skip first address
            index = 1;
            hasFirst = true;
        }
    } catch {
        return 0; // Empty or invalid list
    }

    if (!hasFirst) {
        return 0;
    }

    var found = false;
    var maxChecks = 10;
    var checks = 0;

    while (!found && checks < maxChecks) {
        checks = checks + 1;
        var mode: uint8 = 0;
        try {
            mode = slice.loadUint(2);
        } catch {
            // Try to go to next ref if available
            if (slice.remainingRefsCount() >= 1) {
                slice = slice.loadRef().beginParse();
                try {
                    mode = slice.loadUint(2);
                } catch {
                    return 0; // Not found
                }
            } else {
                return 0; // Not found
            }
        }

        if (mode == 0) {
            return 0; // End of list
        } else if (mode == 1) {
            var addr: address = gameAddress; // Initialize
            try {
                addr = slice.loadAddress();
            } catch {
                return 0; // Not found
            }
            index = index + 1;
            if (addr == gameAddress) {
                return index; // Found
            }
        } else if (mode == 2) {
            if (slice.remainingRefsCount() >= 1) {
                slice = slice.loadRef().beginParse();
            } else {
                return 0; // Not found
            }
        } else {
            return 0; // Invalid mode
        }
    }

    return 0; // Not found
}

// Recipe policy v1 for printer MINTS: initiator must be a registered game OR the
// owner. Cheap active-game check first; full all_games walk only with enough gas.
// THIS is the documented extension point for the future recipe registry.
fun assertMintInitiatorAllowed(storage: RetranslatorStorage, initiator: address, valueCoins: coins) {
    if (initiator == storage.ownerAddress) {
        return;
    }
    assert (storage.gamesInfo != null) throw ERR_GAMES_NOT_SET;
    val gamesInfo = storage.gamesInfo!.load();
    if (initiator == gamesInfo.active_game) {
        return;
    }
    assert (valueCoins >= PRINTER_FULL_GAME_WALK_GAS) throw ERR_INVALID_GAME_SENDER;
    assert (checkGame(initiator, gamesInfo.all_games) != 0) throw ERR_GAME_NOT_FOUND;
}

// =============================================================================
//  Get-methods
// =============================================================================

get fun get_version(): int {
    var storage = lazy RetranslatorStorage.load();
    return storage.version;
}

get fun get_active(): bool {
    var storage = lazy RetranslatorStorage.load();
    return storage.active;
}

get fun get_game_manager(): address {
    var storage = lazy RetranslatorStorage.load();
    return storage.gameManagerAddress;
}

get fun get_owner(): address {
    var storage = lazy RetranslatorStorage.load();
    return storage.ownerAddress;
}

get fun get_jetton_info(): Cell<JettonInfo>? {
    var storage = lazy RetranslatorStorage.load();
    return storage.jettonInfo;
}

get fun get_games_info(): Cell<GamesInfo>? {
    var storage = lazy RetranslatorStorage.load();
    return storage.gamesInfo;
}

get fun get_tools_info(): Cell<ToolsInfo>? {
    var storage = lazy RetranslatorStorage.load();
    return storage.toolsInfo;
}

get fun get_allow_burn(): bool {
    var storage = lazy RetranslatorStorage.load();
    return storage.allow_burn;
}

get fun get_next_nft_index(): int {
    var storage = lazy RetranslatorStorage.load();
    return storage.nextNftIndex;
}

get fun get_next_sbt_index(): int {
    var storage = lazy RetranslatorStorage.load();
    return storage.nextSbtIndex;
}
