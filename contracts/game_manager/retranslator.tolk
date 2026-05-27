import "static"

/*
Rationale: for futher updates in games logic and different system logics (like adding NFT and SBT printers) we need to have a contract that can be updated without changing the game manager code.

Game Manager (GM) can recieve special "R1" message from anyone, that will be retranslated to retranslator (with data about who sent the message).
Retranslator (R*) is a contract that recieves messages from game manager (owner of retranslator), checks who send message, does logic and send messages back to game manager to be retranslated futher.


R1 - message from anyone to GM


R2 - message from GM to R*
R3 - message from R* to GM
R4 - message from GM to anyone



So classic scheme:

anyone -[R1]-> GM
GM -[R2]> R*
R* check sender
R* does logic
R* -[R3]> GM
GM -[R4]> anyone

Receiving TransferNotificationForRecipient from GM jetton wallet:

GM Jetton Wallet (any Jetton) -> GM
GM -> R*
R* check sender (check if it is realy message from custom jetton wallet with correct data)
R* does logic
R* -> GM
GM -> anyone

Examples:

--Minting from games.
1. Game sends R1 to GM.
In R1 data should be ForwardMintRequest but GM do not check it.

2. GM sends R2 to R*.
In R2 data should be ForwardMintRequest.
R* checks if initiator is one of the games.
R* create correct Mint message for game user and pack it into R3 data with JettonMinter address as "to whom GM should send message".

3. R* sends R3 to GM.
GM checks that sender is R*.
GM do not check content and send required massage to R3.recipient.

4. GM sends R4 to JettonMinter address. (but GM does not know JettonMinter address)
JettonMinter checks that sender is GM and message is MintNewJettons and follow mint logic.


--Receiving TransferNotificationForRecipient with upgrade ship data from native GM Jetton Wallet:

1. GM Native Jetton Wallet sends TransferNotificationForRecipient to GM.
GM receive message, do not check sender or content and send R2 message with JettonUsed message packed (using TransferNotificationForRecipient payload data) to R*.

2. GM sends R2 to R*.
In R2 data should be correct payload. (because this an example for ship upgrade R* just check that it is native GM Jetton Wallet)
R* checks if initiator is one of the games.
R* create correct Mint message for game user and pack it into R3 data with JettonMinter address as "to whom GM should send message".

3. R* sends R3 to GM.
GM checks that sender is R*.
GM do not check content and send required massage to R3.recipient.

4. GM sends R4 to JettonMinter address. (but GM does not know JettonMinter address)
JettonMinter checks that sender is GM and message is MintNewJettons and follow mint logic.


*/

type AllowedRequests = ForwardMintRequest | 

struct R1 {
    data: cell
}

struct R2 {
    initiator: address
    data: cell
}

struct R3 {
    recipient: address
    data: cell
}



const VERSION: uint64 = 1;

struct RetranslatorStorage {
    
    gameManagerAddress: address
    version: uint64
    active: bool

    jettonMinterAddress: address?
    gamesInfo: Cell<GamesInfo>?
    toolsInfo: Cell<ToolsInfo>?

}

fun RetranslatorStorage.load() {
    return RetranslatorStorage.fromCell(contract.getData())
}

fun RetranslatorStorage.save(self) {
    contract.setData(self.toCell())
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToRetranslator.fromSlice(in.body);
    var storage = lazy RetranslatorStorage.load();
    match (msg) {
        SetJettonMinterAddress => {
            assert (in.senderAddress == storage.gameManagerAddress) throw ERR_INVALID_OWNER_SENDER;
            storage.jettonMinterAddress = msg.jettonMinterAddress;
            storage.save();
        }
        SetGamesInfo => {
            assert (in.senderAddress == storage.gameManagerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_SET_GAMES_INFO) throw ERR_MESSAGE_VALUE_TOO_LOW;
            
            val gamesInfo = msg.gamesInfo.load();
            // Validate that first game in all_games is active_game
            var allGamesSlice = gamesInfo.all_games.beginParse();
            var firstMode: uint8 = 0;
            var hasFirstMode = false;
            try {
                firstMode = allGamesSlice.loadUint(2);
                hasFirstMode = true;
            } catch {
                hasFirstMode = false;
            }
            if (hasFirstMode && firstMode == 1) { // Mode 1 means address follows
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
            val responseMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ReturnExcessesBack {
                    queryId: 0
                }
            });
            responseMsg.send(SEND_MODE_IGNORE_ERRORS + 128);
        }

        R2 => {
            assert (in.senderAddress == storage.gameManagerAddress) throw ERR_INVALID_OWNER_SENDER;
            

            // R2 should contain whole message with opcode like "forward mint request" or "jetton used"
            // We need to parse it and check if it is correct.

            val data = lazy AllowedRequests.fromSlice(in.data);
            match (data) {
                JettonUsed => {
                    // Check if initiator is native GM Jetton Wallet
                    

                    // TODO (other Jettons)
                }
                ForwardMintRequest => {
                    // Check gams last as if it is not active game gas costs will be higher
                    // Check if initiator is one of the games
                }
            }


            // Check if initiator is one of the games
            




            // Check if initiator is native GM Jetton Wallet

            // Other initiators (TODO)







        }




        ForwardMintRequest => {
            assert (storage.jettonInfo != null) throw ERR_JETTON_MINTER_NOT_SET;
            val jettonInfo = storage.jettonInfo!.load();
            assert (storage.gamesInfo != null) throw ERR_GAMES_NOT_SET;
            val gamesInfo = storage.gamesInfo!.load();
            
            // First check if it is active game
            val isActiveGame = (in.senderAddress == gamesInfo.active_game);
            
            if (!isActiveGame) {
                // If incoming value is less than 0.2 - check only active game
                if (in.valueCoins < ton("0.2")) {
                    assert (false) throw ERR_INVALID_GAME_SENDER;
                }
                // Use checkGame function to check if game is in all_games
                val gameIndex = checkGame(in.senderAddress, gamesInfo.all_games);
                assert (gameIndex != 0) throw ERR_GAME_NOT_FOUND; // 0 means not found
            }
            // Convert ForwardMintRequest to MintNewJettons format
            // The TransferNotification will be sent to the receiver (user) by the JettonWallet
            // Note: forwardPayload is empty because GameManager doesn't receive TransferNotificationForRecipient
            // in the minting flow (it goes to the user, not GameManager)
            val forwardPayload: RemainingBitsAndRefs = beginCell().toSlice();
            // Set forwardTonAmount to ensure TransferNotification is sent from JettonWallet to recipient
            val forwardTonAmount = ton("0.05"); // Enough for notification message
            // sendExcessesTo should be the receiver (user who will receive jettons), not the ship
            val internalTransferStep = InternalTransferStep {
                queryId: 0,
                jettonAmount: msg.amount,
                transferInitiator: null, // null when minting
                sendExcessesTo: msg.receiver, // Send excesses to the receiver (user who gets jettons)
                forwardTonAmount: forwardTonAmount,
                forwardPayload: forwardPayload,
            };

            var dif = in.valueCoins - MINT_TON_AMOUNT - BASIC_STORAGE_TAX;
            val mintNewJettons = MintNewJettons {
                queryId: 0,
                mintRecipient: msg.receiver,
                tonAmount: MINT_TON_AMOUNT + dif,
                internalTransferMsg: internalTransferStep.toCell(),
            };
            reserveValue(in.valueCoins);
            val forwardMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: jettonInfo.jettonMinterAddress,
                value: 0,
                body: mintNewJettons
            });
            forwardMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }

        SetAllowBurn => {
            assert (in.senderAddress == storage.gameManagerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_SET_ALLOW_BURN) throw ERR_MESSAGE_VALUE_TOO_LOW;
            storage.allow_burn = msg.allow_burn;
            storage.save();
            reserveValue(in.valueCoins);
            val responseMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ReturnExcessesBack {
                    queryId: 0
                }
            });
            responseMsg.send(SEND_MODE_IGNORE_ERRORS + 128);
        }
        RequestBurn => {
            assert (storage.allow_burn) throw ERR_BURN_NOT_ALLOWED;
            assert (storage.jettonInfo != null) throw ERR_JETTON_MINTER_NOT_SET;
            val jettonInfo = storage.jettonInfo!.load();
            assert (in.valueCoins >= GAS_COST_REQUEST_BURN) throw ERR_MESSAGE_VALUE_TOO_LOW;
            
            // Calculate GameManager's native jetton wallet address
            val gameManagerWalletAddress = calcAddressOfJettonWallet(contract.getAddress(), jettonInfo.jettonMinterAddress, jettonInfo.jettonWalletCode);
            
            // Create AskToBurn message
            val askToBurn = AskToBurn {
                queryId: msg.queryId,
                jettonAmount: msg.jettonAmount,
                sendExcessesTo: msg.sendExcessesTo,
                customPayload: msg.customPayload,
            };
            
            reserveValue(in.valueCoins);
            val burnMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: gameManagerWalletAddress,
                value: 0,
                body: askToBurn
            });
            burnMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
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