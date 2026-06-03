import "storage"

// NFTPrinter message surface — based on tep/nft/messages.tolk.
//
// Collection surface = DeployNft (mint) + EditNftItem (admin content-edit) +
// ChangeCollectionAdmin (lets the owner re-point admin if GM is replaced) +
// RequestRoyaltyParams (TEP-62 query). The item-side structs (NftItemInitAtDeployment,
// AskToChangeOwnership, RequestStaticData, …) keep the tep/nft wire shape so the
// printer NFT item stays a drop-in TEP-62 item. `content` is now the structured
// Cell<NFTContent> (see storage.tolk) instead of a Cell<SnakeString>.

struct NftItemInitAtDeployment {
    ownerAddress: address
    content: Cell<NFTContent>
}

// collection -> item: replace the item's individual content (authority = collection).
struct (0x00000005) SetNftContent {
    queryId: uint64
    newContent: Cell<NFTContent>
}

struct (0x693d3950) RequestRoyaltyParams {
    queryId: uint64
}

struct (0xa8cb00ad) ResponseRoyaltyParams {
    queryId: uint64
    royaltyParams: RoyaltyParams
}

struct (0x00000001) DeployNft {
    queryId: uint64
    itemIndex: uint64
    attachTonAmount: coins
    initParams: Cell<NftItemInitAtDeployment>
}

struct (0x00000003) ChangeCollectionAdmin {
    queryId: uint64
    newAdminAddress: address
}

// admin (== GM) -> collection: edit one item's content. The collection forwards
// SetNftContent to the item at `itemAddress` (the item checks sender == collection).
// `newContent` is an opaque-to-GM/R* Cell<NFTContent>; only this contract types it.
struct (0x00000006) EditNftItem {
    queryId: uint64
    itemAddress: address
    newContent: Cell<NFTContent>
}

struct (0x2fcb26a2) RequestStaticData {
    queryId: uint64
}

struct (0x8b771735) ResponseStaticData {
    queryId: uint64
    itemIndex: uint256
    collectionAddress: address
}

struct (0x05138d91) NotificationForNewOwner {
    queryId: uint64
    oldOwnerAddress: address
    payload: RemainingBitsAndRefs
}

struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

// TEP-62 transfer (NFTPrinter items are transferable): custom_payload is (Maybe ^Cell)
struct (0x5fcc3d14) AskToChangeOwnership {
    queryId: uint64
    newOwnerAddress: address
    sendExcessesTo: address?
    customPayload: cell?
    forwardTonAmount: coins
    forwardPayload: RemainingBitsAndRefs
}
