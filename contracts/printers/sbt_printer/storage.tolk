import "messages"

// SBTPrinter storage — based on tep/sbtn/storage.tolk.
//
// SbtnPrinterCollectionStorage carries FEATURE-SPACE (`version`, `extra`) appended
// after the proven base layout. The item side (SbtnItemData / SbtnItemStorage /
// calcDeployedSbtnItem) is byte-identical to tep/sbtn so the printer can reuse the
// proven, gate-fixed SBTNItem code as its `sbtnItemCode` and interoperate with it.

// Canonical StateInit data — index, collection, owner only.
struct SbtnItemData {
    index: uint256
    collectionAddress: address
    ownerAddress: address
}

// Full storage after sbtn_init.
struct SbtnItemStorage {
    index: uint256
    collectionAddress: address
    ownerAddress: address
    active: bool
    revokedAt: uint64
    individualContent: cell
}

fun SbtnItemStorage.load() {
    return SbtnItemStorage.fromCell(contract.getData())
}

fun SbtnItemStorage.save(self) {
    contract.setData(self.toCell())
}


struct SbtnCollectionContent {
    collectionMetadata: cell
}

// FEATURE-SPACE: version + extra appended after the proven base head.
struct SbtnPrinterCollectionStorage {
    adminAddress: address
    nextItemIndex: uint256
    content: Cell<SbtnCollectionContent>
    sbtnItemCode: cell
    version: uint32       // printer storage version (1 for v1)
    extra: cell?          // open-ended; add fields here without changing the head
}

fun SbtnPrinterCollectionStorage.load() {
    return SbtnPrinterCollectionStorage.fromCell(contract.getData())
}

fun SbtnPrinterCollectionStorage.save(self) {
    contract.setData(self.toCell())
}

// Address derivation: StateInit data = SbtnItemStorage (extended layout per the
// gate-fixed SBTNItem code; index, collection, owner, active=false, revokedAt=0, empty content).
fun calcDeployedSbtnItem(index: uint256, collectionAddress: address, ownerAddress: address, sbtnItemCode: cell): AutoDeployAddress {
    val storage: SbtnItemStorage = {
        index,
        collectionAddress,
        ownerAddress,
        active: DEFAULT_ACTIVE_STATE,
        revokedAt: DEFAULT_REVOKED_AT,
        individualContent: empty_cell(),
    };
    return {
        stateInit: {
            code: sbtnItemCode,
            data: storage.toCell()
        }
    }
}


fun empty_cell() : cell {
    return beginCell().endCell();
}
