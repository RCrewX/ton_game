import "static"

type AllowedMessagesToSubcontract = 
    | Forward
    | ForwardWithInit
    | Withdraw

fun onInternalMessage(in: InMessage) {
    // Check for excess messages first (they have a specific opcode)
    if (!in.body.isEmpty()) {
        val opcode = in.body.preloadUint(32);
        if (opcode == 0xd53276db) {
            // Handle excess message
            val excessMsg = lazy ReturnExcessesBack.fromSlice(in.body);
            var storage = lazy SubcontractStorage.load();
            // If excess value is greater than threshold, resend to owner
            if (in.valueCoins > EXCESS_THRESHOLD) {
                // Use value 0 with CARRY_ALL_REMAINING_MESSAGE_VALUE to forward all excess after gas
                val out = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.ownerAddress,
                    value: 0,
                    body: ReturnExcessesBack {
                        queryId: excessMsg.queryId
                    }
                });
                out.send(SEND_MODE_IGNORE_ERRORS + SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
            }
            return;
        }
    }
    
    val msg = lazy AllowedMessagesToSubcontract.fromSlice(in.body);
    var storage = lazy SubcontractStorage.load();
    match (msg) {
        Forward => {
            // Auth check
            assert (in.senderAddress == storage.ownerAddress) throw ERR_UNAUTHORIZED;
            // Value check: must cover gas cost + forward amount
            assert (in.valueCoins >= GAS_COST_FORWARD + msg.forwardTonAmount) throw ERR_MESSAGE_VALUE_TOO_LOW;
            // Reserve value, but leave enough for gas + forwardAmount when sending the message
            // When sending a message, we need: forwardAmount (message value) + gas (transaction cost)
            // We reduce reserve by (GAS_COST_FORWARD + msg.forwardTonAmount) to ensure we have enough
            reserveValue(in.valueCoins, -(GAS_COST_FORWARD + msg.forwardTonAmount));
            // Build outgoing message with bounce from command
            // Tolk BounceMode enum: NoBounce (0), Only256BitsOfBody (2)
            // For bounce=true, we use Only256BitsOfBody as it's the only bounce option available
            // For bounce=false, we use NoBounce
            var bounceMode: BounceMode;
            if (msg.bounce) {
                bounceMode = BounceMode.Only256BitsOfBody;
            } else {
                bounceMode = BounceMode.NoBounce;
            }
            val out = createMessage({
                bounce: bounceMode,
                dest: msg.destination,
                value: msg.forwardTonAmount,
                body: msg.messageBody
            });
            // Send with sendMode from command (no hardcoded 128)
            out.send(msg.sendMode);
        }
        ForwardWithInit => {
            // Auth check
            assert (in.senderAddress == storage.ownerAddress) throw ERR_UNAUTHORIZED;
            // Value check: must cover gas cost + forward amount
            assert (in.valueCoins >= GAS_COST_FORWARD_WITH_INIT + msg.forwardTonAmount) throw ERR_MESSAGE_VALUE_TOO_LOW;
            // Reserve value, but leave enough for gas + forwardAmount when sending the message
            // When sending a message, we need: forwardAmount (message value) + gas (transaction cost)
            // We reduce reserve by (GAS_COST_FORWARD_WITH_INIT + msg.forwardTonAmount) to ensure we have enough
            reserveValue(in.valueCoins, -(GAS_COST_FORWARD_WITH_INIT + msg.forwardTonAmount));
            // Build outgoing message with stateInit
            // Deploy rule: stateInit present, enforce NoBounce (forced, not checked)
            // In Tolk, stateInit is included when using AutoDeployAddress as dest
            // Parse stateInit cell: stateInit$00 code:^Cell data:^Cell
            var stateInitSlice = msg.stateInit.beginParse();
            val _splitDepth = stateInitSlice.loadUint(1); // Skip split_depth (1 bit)
            val _special = stateInitSlice.loadUint(1); // Skip special (1 bit)
            val code = stateInitSlice.loadRef(); // Load code cell
            val data = stateInitSlice.loadRef(); // Load data cell
            // Create AutoDeployAddress with the parsed stateInit
            val deployAddress: AutoDeployAddress = {
                stateInit: {
                    code: code,
                    data: data
                }
            };
            val out = createMessage({
                bounce: BounceMode.NoBounce,  // Enforced for deploy
                dest: deployAddress,
                value: msg.forwardTonAmount,
                body: msg.messageBody
            });
            // Send with sendMode from command
            out.send(msg.sendMode);
        }
        Withdraw => {
            // Auth check
            assert (in.senderAddress == storage.ownerAddress) throw ERR_UNAUTHORIZED;
            // Calculate withdrawable amount: current balance - BASIC_STORAGE_TAX (for gas safety)
            // getOriginalBalance() returns balance before processing the current message
            // We need to account for the incoming message value
            val balanceBeforeMsg = contract.getOriginalBalance() - in.valueCoins;
            val withdrawAmount = balanceBeforeMsg - BASIC_STORAGE_TAX;
            // Only withdraw if we have more than BASIC_STORAGE_TAX
            if (withdrawAmount > 0) {
                val out = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.ownerAddress,
                    value: withdrawAmount,
                    body: beginCell().endCell() // Empty body for simple transfer
                });
                out.send(SEND_MODE_IGNORE_ERRORS + SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
            }
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

get fun get_owner_address(): address {
    var storage = lazy SubcontractStorage.load();
    return storage.ownerAddress;
}

get fun get_id(): uint256 {
    var storage = lazy SubcontractStorage.load();
    return storage.id;
}

get fun get_subcontract_address(id: uint256): address {
    return calcAddressOfSubcontract(contract.getAddress(), id, contract.getCode());
}

get fun get_subcontract_by_id_address(ownerAddress: address, id: uint256): address {
    return calcAddressOfSubcontract(ownerAddress, id, contract.getCode());
}

