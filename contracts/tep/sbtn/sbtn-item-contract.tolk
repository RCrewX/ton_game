import "@stdlib/gas-payments"
import "errors"
import "storage"
import "messages"
import "fees-management"

type AllowedMessageToSbtnItem =
    | SbtnInit
    | ProveOwnership
    | RequestOwner
    | Destroy
    | Revoke
    | RequestStaticData
    | AskToChangeOwnership

fun onInternalMessage(in: InMessage) {
    var storage = lazy SbtnItemStorage.load();
    val msg = lazy AllowedMessageToSbtnItem.fromSlice(in.body);

    match (msg) {
        SbtnInit => {
            if (storage.active) {
                throw ERROR_ALREADY_INITIALIZED
            }
            storage.active = true;
            storage.individualContent = msg.individualContent;
            storage.save();
            return;
        }

        AskToChangeOwnership => {
            throw ERROR_SBTN_TRANSFER_FORBIDDEN
        }

        ProveOwnership => {
            assert (storage.active == true) throw ERROR_NOT_INITIALIZED;
            assert (in.senderAddress == storage.ownerAddress) throw ERROR_NOT_FROM_OWNER;

            var contentCell: cell? = null;
            if (msg.withContent) {
                contentCell = storage.individualContent;
            }
            val proofMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.destination,
                value: 0,
                body: OwnershipProof {
                    queryId: msg.queryId,
                    itemId: storage.index,
                    owner: storage.ownerAddress!,
                    data: msg.forwardPayload,
                    revokedAt: storage.revokedAt,
                    content: contentCell,
                }
            });
            proofMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        RequestOwner => {
            assert (storage.active == true) throw ERROR_NOT_INITIALIZED;

            var contentCell: cell? = null;
            if (msg.withContent) {
                contentCell = storage.individualContent.toCell();
            }
            val infoMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.destination,
                value: 0,
                body: OwnerInfo {
                    queryId: msg.queryId,
                    itemId: storage.index,
                    initiator: in.senderAddress,
                    owner: storage.ownerAddress!,
                    data: msg.forwardPayload,
                    revokedAt: storage.revokedAt,
                    content: contentCell,
                }
            });
            infoMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        Destroy => {
            // TODO Correct "Destroy"
            assert (storage.active == true) throw ERROR_NOT_INITIALIZED;
            assert (in.senderAddress == storage.ownerAddress) throw ERROR_NOT_FROM_OWNER;

            storage.active = false;
            // storage.ownerAddress = null;
            
            storage.save();
            
            // val restAmount = contract.getOriginalBalance() - MIN_TONS_FOR_STORAGE;
            val excessesMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: Excesses { queryId: msg.queryId }
            });
            // TODO Correct "Destroy" mode 
            excessesMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }

        Revoke => {
            assert (storage.active == true) throw ERROR_NOT_INITIALIZED;
            assert (in.senderAddress == storage.collectionAddress) throw ERROR_NOT_AUTHORITY;
            assert (storage.revokedAt == 0) throw ERROR_ALREADY_REVOKED;


            storage.active = false;
            storage.revokedAt = blockchain.now() as uint64;
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
                        itemIndex: storage.index,
                        collectionAddress: storage.collectionAddress,
                    }
                }
            });
            respondMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

struct SbtnDataReply {
    isInitialized: bool
    itemIndex: int
    collectionAddress: address
    ownerAddress: address? = null
    content: cell? = null
    authority: address? = null
    revokedAt: uint64 = 0
}

get fun get_nft_data(): SbtnDataReply {
    var storage = lazy SbtnItemStorage.load();
    return {
        isInitialized: storage.active,
        itemIndex: storage.index as int,
        collectionAddress: storage.collectionAddress,
        ownerAddress: storage.ownerAddress,
        content: storage.individualContent,
        authority: storage.collectionAddress,
        revokedAt: storage.revokedAt,
    }
}

get fun get_authority_address(): address {
    
    var storage = lazy SbtnItemStorage.load();
    return storage.collectionAddress;
}

get fun get_revoked_time(): int {
    var storage = lazy SbtnItemStorage.load();
    return storage.revokedAt as int;
}
