// NFTPrinter storage — based on tep/nft/storage.tolk.
//
// Distinct from the base NFT collection in ONE way: NftPrinterCollectionStorage
// carries FEATURE-SPACE (`version`, `extra`) so the printer can grow (e.g. a
// future content-edit recipe) WITHOUT a layout-breaking change. The item side
// (NftItemStorage / NftItemStorageNotInitialized / calcDeployedNftItem) is kept
// byte-identical to tep/nft so the printer can reuse the proven NFTItem code as
// its `nftItemCode` and interoperate with it unchanged.

// SnakeString: short strings stored as-is; long strings as nested refs.
type SnakeString = slice

fun SnakeString.unpackFromSlice(mutate s: slice) {
    val snakeRemainder = s;
    s = createEmptySlice();
    return snakeRemainder
}

fun SnakeString.packToBuilder(self, mutate b: builder) {
    b.storeSlice(self)
}


struct RoyaltyParams {
    numerator: uint16
    denominator: uint16
    royaltyAddress: address
}

// FEATURE-SPACE: version + extra are appended AFTER the proven base layout so the
// head (admin..royaltyParams) stays identical to tep/nft and the wrapper/tests can
// rely on the same field order.
struct NftPrinterCollectionStorage {
    adminAddress: address
    nextItemIndex: uint64
    content: Cell<CollectionContent>
    nftItemCode: cell
    royaltyParams: Cell<RoyaltyParams>
    version: uint32       // printer storage version (1 for v1)
    extra: cell?          // open-ended; add fields here without changing the head
}

struct CollectionContent {
    collectionMetadata: cell
    commonContent: Cell<SnakeString>
}

// --- item side: identical to tep/nft (reused NFTItem code depends on this) ---

struct NftItemStorage {
    itemIndex: uint64
    collectionAddress: address
    ownerAddress: address
    content: Cell<SnakeString>
}

struct NftItemStorageNotInitialized {
    itemIndex: uint64
    collectionAddress: address
}


fun NftPrinterCollectionStorage.load() {
    return NftPrinterCollectionStorage.fromCell(contract.getData())
}

fun NftPrinterCollectionStorage.save(self) {
    contract.setData(self.toCell())
}


fun calcDeployedNftItem(itemIndex: uint64, collectionAddress: address, nftItemCode: cell): AutoDeployAddress {
    val emptyNftItemStorage: NftItemStorageNotInitialized = {
        itemIndex,
        collectionAddress,
    };

    return {
        stateInit: {
            code: nftItemCode,
            data: emptyNftItemStorage.toCell()
        }
    }
}
