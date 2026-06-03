import "errors"
import "storage"
import "messages"

// =============================================================================
// NFTPrinter (collection) = GM-owned, R*-governed TEP-62 collection.
//
//   adminAddress == GameManager (the sole on-chain authority). Mints are driven
//   by the Retranslator over R1→R2→R3→R4: R* validates the recipe (game-or-owner)
//   and tells GM to emit DeployNft here; since sender == admin == GM, it passes.
//
// NFTPrinter items are TEP-62 TRANSFERABLE (game NFTs are tradeable). The item
// code is the proven tep/nft NFTItem, supplied as `nftItemCode` at deploy time.
//
// v1 surface: DeployNft (mint) + ChangeCollectionAdmin + RequestRoyaltyParams.
// NO content-edit in v1 (feature-space reserved on storage for later).
// =============================================================================

fun deployNftItem(itemIndex: int, nftItemCode: cell, attachTonAmount: coins, initParams: Cell<NftItemInitAtDeployment>) {
    val deployMsg = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        dest: calcDeployedNftItem(itemIndex, contract.getAddress(), nftItemCode),
        value: attachTonAmount,
        body: initParams,
    });
    deployMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

type AllowedMessageToNftPrinterCollection =
    | RequestRoyaltyParams
    | DeployNft
    | ChangeCollectionAdmin

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToNftPrinterCollection.fromSlice(in.body);

    match (msg) {
        DeployNft => {
            var storage = lazy NftPrinterCollectionStorage.load();
            assert (in.senderAddress == storage.adminAddress) throw ERROR_NOT_FROM_ADMIN;
            assert (msg.itemIndex <= storage.nextItemIndex) throw ERROR_INVALID_ITEM_INDEX;

            val isLast = msg.itemIndex == storage.nextItemIndex;
            deployNftItem(msg.itemIndex, storage.nftItemCode, msg.attachTonAmount, msg.initParams);
            if (isLast) {
                storage.nextItemIndex += 1;
                storage.save();
            }
        }

        RequestRoyaltyParams => {
            val storage = lazy NftPrinterCollectionStorage.load();
            val respondMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ResponseRoyaltyParams {
                    queryId: msg.queryId,
                    royaltyParams: storage.royaltyParams.load(),
                }
            });
            respondMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        ChangeCollectionAdmin => {
            var storage = lazy NftPrinterCollectionStorage.load();
            assert (in.senderAddress == storage.adminAddress) throw ERROR_NOT_FROM_ADMIN;
            storage.adminAddress = msg.newAdminAddress;
            storage.save();
        }

        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}


struct CollectionDataReply {
    nextItemIndex: int
    collectionMetadata: cell
    adminAddress: address
}

struct (0x01) OffchainMetadataReply {
    string: SnakeString
}

get fun get_collection_data(): CollectionDataReply {
    val storage = lazy NftPrinterCollectionStorage.load();
    val content = lazy storage.content.load();

    return {
        nextItemIndex: storage.nextItemIndex,
        collectionMetadata: content.collectionMetadata,
        adminAddress: storage.adminAddress,
    }
}

get fun get_nft_address_by_index(itemIndex: int): address {
    val storage = lazy NftPrinterCollectionStorage.load();
    val nftDeployed = calcDeployedNftItem(itemIndex, contract.getAddress(), storage.nftItemCode);
    return nftDeployed.calculateAddress();
}

get fun royalty_params(): RoyaltyParams {
    val storage = lazy NftPrinterCollectionStorage.load();
    return storage.royaltyParams.load();
}

get fun get_nft_content(itemIndex: int, individualNftContent: Cell<SnakeString>): Cell<OffchainMetadataReply> {
    val storage = lazy NftPrinterCollectionStorage.load();
    val content = lazy storage.content.load();

    return OffchainMetadataReply {
        string: beginCell()
            .storeSlice(content.commonContent.load())
            .storeRef(individualNftContent)
            .endCell().beginParse()
    }.toCell()
}

get fun get_version(): int {
    val storage = lazy NftPrinterCollectionStorage.load();
    return storage.version;
}
