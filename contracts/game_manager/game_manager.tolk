import "static"

type AllowedMessagesToGameManager = 
    | SetJettonMinterAddress
    | SetGames 
    | AnyMessage




fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToGameManager.fromSlice(in.body);
    var storage = lazy GameManagerStorage.load();
    match (msg) {
        SetJettonMinterAddress => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_UNAUTHORIZED;
            if (msg.jettonMinterAddress != storage.jettonMinterAddress) {
                storage.jettonMinterAddress = msg.jettonMinterAddress;
                storage.save();
            }
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
            if (msg.games != storage.games) {
                storage.games = msg.games;
            }
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

