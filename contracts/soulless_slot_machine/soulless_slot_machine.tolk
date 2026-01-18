import "static"

type AllowedMessagesToSSM = 
    | TryLuck
    | SetMintAmount
    | AnyMessage

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToSSM.fromSlice(in.body);
    var storage = lazy SSMStorage.load();
    
    match (msg) {
        TryLuck => {
            // Hard check: must have at least 1 TON
            assert (in.valueCoins >= TRY_LUCK_REQUIRED_AMOUNT) throw ERR_INSUFFICIENT_TRY_LUCK_AMOUNT;
            
            // Check if excess should be returned (more than 1.2 TON)
            var excessAmount: coins = 0;
            if (in.valueCoins > TRY_LUCK_MAX_AMOUNT) {
                excessAmount = in.valueCoins - TRY_LUCK_REQUIRED_AMOUNT;
            }
            
            // Initialize random and generate random number (0-99)
            random.initialize();
            val randomValue: uint8 = random.range(100);
            
            // 5% chance to win (randomValue < 5)
            val isWinner = (randomValue < WIN_CHANCE_PERCENT);
            
            // Reserve value first
            reserveValue(in.valueCoins);
            
            // Return excess if value > 1.2 TON (for both winners and losers)
            if (excessAmount > GAS_COST_RETURN_EXCESS) {
                val excessMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: in.senderAddress,
                    value: excessAmount - GAS_COST_RETURN_EXCESS,
                    body: ReturnExcessesBack {
                        queryId: msg.queryId
                    }
                });
                excessMsg.send(SEND_MODE_IGNORE_ERRORS);
            }
            
            if (isWinner) {
                // Winner! Send ForwardMintRequest to GameManager (owner)
                val forwardMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.ownerAddress,
                    value: 0, // Will use remaining balance
                    body: ForwardMintRequest {
                        receiver: in.senderAddress,
                        amount: storage.mintAmount,
                    }
                });
                forwardMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
            }
            // If not a winner, we've already reserved and sent excess if needed
        }
        SetMintAmount => {
            // Only owner (GameManager) can set mint amount
            assert (in.senderAddress == storage.ownerAddress) throw ERR_INVALID_OWNER_SENDER;
            assert (in.valueCoins >= GAS_COST_SET_MINT_AMOUNT) throw ERR_MESSAGE_VALUE_TOO_LOW;
            
            storage.mintAmount = msg.mintAmount;
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
            responseMsg.send(SEND_MODE_IGNORE_ERRORS + SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
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

// Getters

get fun get_owner_address(): address {
    var storage = lazy SSMStorage.load();
    return storage.ownerAddress;
}

get fun get_mint_amount(): coins {
    var storage = lazy SSMStorage.load();
    return storage.mintAmount;
}

get fun get_storage(): (address, coins) {
    var storage = lazy SSMStorage.load();
    return (storage.ownerAddress, storage.mintAmount);
}
