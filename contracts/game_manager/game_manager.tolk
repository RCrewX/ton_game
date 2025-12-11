import "static"

type AllowedMessagesToGameManager = 
    | SetJettonMinterAddress
    | SetGames 
    | ForwardMintRequest
    | AnyMessage




fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToGameManager.fromSlice(in.body);
    var storage = lazy GameManagerStorage.load();
    match (msg) {
        SetJettonMinterAddress => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_UNAUTHORIZED;

            storage.jettonMinterAddress = msg.jettonMinterAddress;
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
            assert (in.senderAddress == storage.ownerAddress) throw ERR_UNAUTHORIZED;
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
        ForwardMintRequest => {
            assert (storage.jettonMinterAddress != null) throw 5;
            // Convert ForwardMintRequest to MintNewJettons format
            val emptyPayload: RemainingBitsAndRefs = beginCell().endCell();
            val internalTransferStep = InternalTransferStep {
                queryId: 0,
                jettonAmount: msg.amount,
                transferInitiator: null, // null when minting
                sendExcessesTo: null,
                forwardTonAmount: 0,
                forwardPayload: emptyPayload,
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
                value: in.valueCoins,
                body: mintNewJettons
            });
            forwardMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
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

