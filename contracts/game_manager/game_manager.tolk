import "static"

type AllowedMessagesToGameManager = 
    | DeployJetton
    | SetGamesInfo
    | RedirectMessage
    | ForwardMintRequest
    | TransferNotificationForRecipient
    | SetAllowBurn
    | RequestBurn
    | AnyMessage




fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToGameManager.fromSlice(in.body);
    var storage = lazy GameManagerStorage.load();
    match (msg) {
        DeployJetton => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_DEPLOY_JETTON) throw ERR_MESSAGE_VALUE_TOO_LOW;
            assert (storage.jettonInfo == null) throw ERR_JETTON_INFO_ALREADY_SET;
            
            // Calculate jetton minter data using GameManager address as admin and content from message
            val jettonMinterData = createMinterStorage(contract.getAddress(), msg.jettonContent, msg.jettonWalletCode);
            
            // Calculate jetton minter address and AutoDeployAddress from code and data
            val minterDeployed = calcDeployedJettonMinter(msg.jettonMinterCode, jettonMinterData);
            val jettonMinterAddress = minterDeployed.calculateAddress();
            
            // Create and save JettonInfo
            val jettonInfo: JettonInfo = {
                jettonMinterAddress: jettonMinterAddress,
                jettonWalletCode: msg.jettonWalletCode,
            };
            storage.jettonInfo = jettonInfo.toCell();
            storage.save();
            
            // Send first Mint message to jettonMinter with initData for deployment
            // Using AutoDeployAddress as dest will include stateInit for deployment
            val forwardPayload: RemainingBitsAndRefs = beginCell().toSlice();
            val forwardTonAmount = ton("0.05");
            val internalTransferStep = InternalTransferStep {
                queryId: 0,
                jettonAmount: 1, // Small amount for initial deployment mint
                transferInitiator: null,
                sendExcessesTo: contract.getAddress(), // Send excesses back to GameManager
                forwardTonAmount: forwardTonAmount,
                forwardPayload: forwardPayload,
            };
            
            var dif = in.valueCoins - MINT_TON_AMOUNT - BASIC_STORAGE_TAX;
            val mintNewJettons = MintNewJettons {
                queryId: 0,
                mintRecipient: contract.getAddress(), // Mint to GameManager initially
                tonAmount: MINT_TON_AMOUNT + dif,
                internalTransferMsg: internalTransferStep.toCell(),
            };
            
            reserveValue(in.valueCoins);
            val deployMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: minterDeployed, // AutoDeployAddress includes stateInit
                value: 0,
                body: mintNewJettons,
            });
            deployMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        SetGamesInfo => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
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
        TransferNotificationForRecipient => {
            var storage = lazy GameManagerStorage.load();
            assert (storage.jettonInfo != null) throw ERR_JETTON_MINTER_NOT_SET;
            val jettonInfo = storage.jettonInfo!.load();
            // Verify sender is GameManager's jetton wallet (native jetton)
            val expectedWalletAddress = calcAddressOfJettonWallet(contract.getAddress(), jettonInfo.jettonMinterAddress, jettonInfo.jettonWalletCode);
            assert (in.senderAddress == expectedWalletAddress) throw ERR_INVALID_JETTON_WALLET_SENDER;
            
            // Extract game address and data from forwardPayload
            // forwardPayload is RemainingBitsAndRefs (a slice)
            // When a cell with refs is passed, it's stored as a ref in the slice
            // So we need to: load the cell ref, then access its refs
            var forwardPayloadSlice: slice = msg.forwardPayload;

            // Check if we have at least one ref (the cell containing our data)
            if (forwardPayloadSlice.remainingRefsCount() < 1) {
                reserveValue(in.valueCoins);
                return;
            }

            if (msg.jettonAmount < MIN_JETTON_USAGE_AMOUNT) {
                reserveValue(in.valueCoins);
                return;
            }
            
            // Load the cell that contains our refs
            val payloadCell = forwardPayloadSlice.loadRef();
            var payloadSlice = payloadCell.beginParse();
            
            // Check if the payload cell has at least 2 refs
            if (payloadSlice.remainingRefsCount() < 2) {
                reserveValue(in.valueCoins);
                return;
            }
            
            // Load the first ref (game address cell)
            val gameAddressCell = payloadSlice.loadRef();
            val gameAddress = gameAddressCell.beginParse().loadAddress();
            
            // Load the second ref (data cell with ship address)
            val dataCell = payloadSlice.loadRef();
            
            
            // Get game address from games
            // val game = storage.games!.beginParse().loadAddress();
            
            reserveValue(in.valueCoins);
            
            // Send upgrade request to Game
            val upgradeRequestMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: gameAddress,
                value: 0,
                body: JettonUsed {
                    jettonAmount: msg.jettonAmount,
                    data: dataCell,
                }
            });
            upgradeRequestMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        SetAllowBurn => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
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
                dest: storage.ownerAddress,
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

fun checkGame(gameAddress: address, all_games: cell): uint16 {
    // Parse through all_games as described in rules and return index
    // Skip first game (this function runs only if gameAddress != active_game, and first game in all_games is active_game)
    // Return 0 if not found, otherwise return 1-based index
    // Simplified version: for now, just return 1 if we can parse at least one address after the first
    // TODO: Implement full parsing logic with proper error handling
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
    
    // Try to find the game in the remaining list
    // For now, implement a simple version that checks the next few entries
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

get fun get_owner_address(): address {
    var storage = lazy GameManagerStorage.load();
    return storage.ownerAddress;
}

get fun get_jetton_minter_address(): address? {
    var storage = lazy GameManagerStorage.load();
    if (storage.jettonInfo == null) {
        return null;
    }
    val jettonInfo = storage.jettonInfo!.load();
    return jettonInfo.jettonMinterAddress;
}

get fun get_games(): cell? {
    var storage = lazy GameManagerStorage.load();
    // Deprecated: returns all_games from gamesInfo for backward compatibility
    if (storage.gamesInfo == null) {
        return null;
    }
    val gamesInfo = storage.gamesInfo!.load();
    return gamesInfo.all_games;
}

get fun get_jetton_info(): Cell<JettonInfo>? {
    var storage = lazy GameManagerStorage.load();
    return storage.jettonInfo;
}

get fun get_games_info(): Cell<GamesInfo>? {
    var storage = lazy GameManagerStorage.load();
    return storage.gamesInfo;
}

get fun get_allow_burn(): bool {
    var storage = lazy GameManagerStorage.load();
    return storage.allow_burn;
}

