import "@stdlib/gas-payments"
import "errors"
import "storage"
import "messages"
import "fees-management"

// =============================================================================
// NFTPrinter ITEM = the tep/nft NFTItem (TEP-62 transferable) PLUS one extra,
// collection-gated message: SetNftContent (admin content-edit, driven by R*'s
// ANVIL section through the collection). Storage WIRE layout is identical to
// tep/nft (itemIndex, collection, owner, content-ref) so the collection's
// address derivation (calcDeployedNftItem) is unchanged — only the content ref
// is now a structured Cell<NFTContent> instead of a Cell<SnakeString>.
// tep/nft itself is left untouched.
// =============================================================================

type AllowedMessageToNftItem =
    | AskToChangeOwnership
    | RequestStaticData
    | SetNftContent

fun onInternalMessage(in: InMessage) {
    var loadingStorage = startLoadingNftItemStorage();
    if (!loadingStorage.isInitialized()) {
        val uninitedSt = loadingStorage.parseNotInitialized();
        assert (in.senderAddress == uninitedSt.collectionAddress) throw ERROR_NOT_FROM_COLLECTION;

        // using a message from collection, convert "uninitialized" to "initialized" state
        val initParams = NftItemInitAtDeployment.fromSlice(in.body);
        val storage: NftItemStorage = {
            itemIndex: uninitedSt.itemIndex,
            collectionAddress: uninitedSt.collectionAddress,
            ownerAddress: initParams.ownerAddress,
            content: initParams.content,
        };
        storage.save();
        return;
    }

    var storage = loadingStorage.parseInitialized();

    val msg = lazy AllowedMessageToNftItem.fromSlice(in.body);

    match (msg) {
        // Content-edit: ONLY the collection (== printer; admin == GM) may overwrite
        // the structured content. The recipe authority (owner/GM, later finer-grained)
        // is enforced upstream in R*'s ANVIL section; the item just trusts its collection.
        SetNftContent => {
            assert (in.senderAddress == storage.collectionAddress) throw ERROR_NOT_FROM_COLLECTION;
            storage.content = msg.newContent;
            storage.save();
        }

        AskToChangeOwnership => {
            assert (in.senderAddress == storage.ownerAddress) throw ERROR_NOT_FROM_OWNER;

            assert (msg.forwardPayload.remainingBitsCount()) throw ERROR_INCORRECT_FORWARD_PAYLOAD;
            assert (msg.newOwnerAddress.getWorkchain() == BASECHAIN) throw ERROR_INVALID_WORKCHAIN;

            val fwdFee = in.originalForwardFee;
            var restAmount = contract.getOriginalBalance() - MIN_TONS_FOR_STORAGE;
            if (msg.forwardTonAmount) {
                restAmount -= (msg.forwardTonAmount + fwdFee);
            }
            if (msg.sendExcessesTo != null) {
                assert (msg.sendExcessesTo.getWorkchain() == BASECHAIN) throw ERROR_INVALID_WORKCHAIN;
                restAmount -= fwdFee;
            }

            assert (restAmount >= 0) throw ERROR_TOO_SMALL_REST_AMOUNT;

            if (msg.forwardTonAmount) {
                val ownershipMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: msg.newOwnerAddress,
                    value: msg.forwardTonAmount,
                    body: NotificationForNewOwner {
                        queryId: msg.queryId,
                        oldOwnerAddress: storage.ownerAddress,
                        payload: msg.forwardPayload,
                    }
                });
                ownershipMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
            }
            if (msg.sendExcessesTo != null) {
                val excessesMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: msg.sendExcessesTo,
                    value: restAmount,
                    body: ReturnExcessesBack {
                        queryId: msg.queryId,
                    }
                });
                excessesMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
            }

            storage.ownerAddress = msg.newOwnerAddress;
            storage.save();
        }

        RequestStaticData => {
            val respondMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: UnsafeBodyNoRef {
                    forceInline: ResponseStaticData {
                        queryId: msg.queryId,
                        itemIndex: storage.itemIndex as uint256,
                        collectionAddress: storage.collectionAddress,
                    }
                }
            });
            respondMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}


struct NftDataReply {
    isInitialized: bool
    itemIndex: int
    collectionAddress: address
    ownerAddress: address? = null
    content: Cell<NFTContent>? = null
}

get fun get_nft_data(): NftDataReply {
    var loadingStorage = startLoadingNftItemStorage();
    if (!loadingStorage.isInitialized()) {
        val uninitedSt = loadingStorage.parseNotInitialized();
        return {
            isInitialized: false,
            itemIndex: uninitedSt.itemIndex,
            collectionAddress: uninitedSt.collectionAddress,
        }
    }

    val storage = loadingStorage.parseInitialized();
    return {
        isInitialized: true,
        itemIndex: storage.itemIndex,
        collectionAddress: storage.collectionAddress,
        ownerAddress: storage.ownerAddress,
        content: storage.content,
    }
}

// Typed view of the structured content: returns origin, type, tier.
get fun get_nft_content_fields(): NFTContent {
    val storage = NftItemStorage.fromCell(contract.getData());
    return storage.content.load();
}
