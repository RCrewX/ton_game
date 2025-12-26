import "static"

type AllowedMessagesToGameManager = 
    | SetJettonMinterAddress
    | SetGames 
    | RedirectMessage
    | ForwardMintRequest
    | TransferNotificationForRecipient
    | AnyMessage




fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToGameManager.fromSlice(in.body);
    var storage = lazy GameManagerStorage.load();
    match (msg) {
        SetJettonMinterAddress => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_SET_JETTON_MINTER_ADDRESS) throw ERR_MESSAGE_VALUE_TOO_LOW;

            storage.jettonMinterAddress = msg.jettonMinterAddress;
            storage.jettonWalletCode = msg.jettonWalletCode;
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
        SetGames => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_SET_GAMES) throw ERR_MESSAGE_VALUE_TOO_LOW;
            storage.games = msg.games;
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
        RedirectMessage => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_REDIRECT_MESSAGE) throw ERR_MESSAGE_VALUE_TOO_LOW;
            reserveValue(in.valueCoins);
            val redirectMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.destination,
                value: msg.forwardTonAmount,
                body: msg.messageBody
            });
            redirectMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        ForwardMintRequest => {
            assert (storage.jettonMinterAddress != null) throw ERR_JETTON_MINTER_NOT_SET;

            // Check if sender is game from games
            assert (storage.games != null) throw ERR_GAMES_NOT_SET;
            val game = storage.games!.beginParse().loadAddress();
            assert (in.senderAddress == game) throw ERR_INVALID_GAME_SENDER;
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
            val mintNewJettons = MintNewJettons {
                queryId: 0,
                mintRecipient: msg.receiver,
                tonAmount: MINT_TON_AMOUNT,
                internalTransferMsg: internalTransferStep.toCell(),
            };
            reserveValue(in.valueCoins);
            val forwardMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: storage.jettonMinterAddress!,
                value: 0,
                body: mintNewJettons
            });
            forwardMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        TransferNotificationForRecipient => {
            var storage = lazy GameManagerStorage.load();
            assert (storage.jettonMinterAddress != null) throw ERR_JETTON_MINTER_NOT_SET;
            assert (storage.jettonWalletCode != null) throw ERR_JETTON_WALLET_CODE_NOT_SET;
            // Verify sender is GameManager's jetton wallet (native jetton)
            val expectedWalletAddress = calcAddressOfJettonWallet(contract.getAddress(), storage.jettonMinterAddress!, storage.jettonWalletCode!);
            assert (in.senderAddress == expectedWalletAddress) throw ERR_INVALID_JETTON_WALLET_SENDER;
            
            // Extract ship address from forwardPayload
            // forwardPayload is RemainingBitsAndRefs, which can be a slice or contain a ref
            // If it's stored as a Cell in the test, it will be in a ref
            var forwardPayloadSlice: slice = msg.forwardPayload;
            var shipAddress: address;
            if (forwardPayloadSlice.remainingRefsCount() > 0) {
                // Address is stored in a ref (Cell)
                val payloadCell = forwardPayloadSlice.loadRef();
                shipAddress = payloadCell.beginParse().loadAddress();
            } else {
                // Address is stored directly in the slice
                shipAddress = forwardPayloadSlice.loadAddress();
            }
            // Calculate HP increase using random by time (1 to N, where N is jettonAmount)
            random.initialize();
            val jettonAmountUint = msg.jettonAmount as uint256;
            val hpIncrease = random.range(jettonAmountUint) + 1; // 1 to N inclusive
            
            // Get game address from games
            assert (storage.games != null) throw ERR_GAMES_NOT_SET;
            val game = storage.games!.beginParse().loadAddress();
            
            reserveValue(in.valueCoins);
            
            // Send upgrade request to Game
            val upgradeRequestMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: game,
                value: 0,
                body: UpgradeShipRequest {
                    shipAddress: shipAddress,
                    hpIncrease: hpIncrease,
                }
            });
            upgradeRequestMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        ReturnExcessesBack => {
            reserveValue(in.valueCoins);
            val responseMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: msg
            });
        }
        LiteralyAnything => {
            reserveValue(in.valueCoins);
            val responseMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: msg
            });
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

get fun get_owner_address(): address {
    var storage = lazy GameManagerStorage.load();
    return storage.ownerAddress;
}

get fun get_jetton_minter_address(): address? {
    var storage = lazy GameManagerStorage.load();
    return storage.jettonMinterAddress;
}

get fun get_games(): cell? {
    var storage = lazy GameManagerStorage.load();
    return storage.games;
}

