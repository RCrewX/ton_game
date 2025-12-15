import "static"

type AllowedMessagesToSubcontract = 
    | RedirectMessage
    | AnyMessage

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToSubcontract.fromSlice(in.body);
    var storage = lazy SubcontractStorage.load();
    match (msg) {
        RedirectMessage => {
            assert (in.senderAddress == storage.ownerAddress) throw ERR_UNAUTHORIZED;
            assert (in.valueCoins >= GAS_COST_REDIRECT_MESSAGE) throw ERR_MESSAGE_VALUE_TOO_LOW;
            reserveValue(in.valueCoins);
            val redirectMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.destination,
                value: msg.forwardTonAmount,
                body: msg.messageBody
            });
            redirectMsg.send(128);
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

