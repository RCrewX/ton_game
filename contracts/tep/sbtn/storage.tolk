import "messages.tolk"

// SBTN (TEP-6666): canonical StateInit data — index, collection, owner only (no authority/content).
struct SbtnItemData {
    index: uint256
    collectionAddress: address
    ownerAddress: address
}

// Full storage after sbtn_init: index, collection, owner (null after destroy), active=true, revokedAt, individualContent.
// Authority is always collection (not stored). Custom (de)serialization so individualContent is always a ref.
struct SbtnItemStorage {
    index: uint256
    collectionAddress: address
    ownerAddress: address
    active: bool
    revokedAt: uint64
    individualContent: cell
}

// fun SbtnItemStorage.toCell(self): cell {
//     var b = beginCell()
//         .storeUint(self.index, 256)
//         .storeAddress(self.collectionAddress);
//     if (self.ownerAddress != null) {
//         b = b.storeUint(1, 1).storeAddress(self.ownerAddress!);
//     } else {
//         b = b.storeUint(0, 1);
//     }
//     b = b.storeUint(self.active ? 1 : 0, 1).storeUint(self.revokedAt, 64).storeRef(self.individualContent);
//     return b.endCell();
// }

// fun SbtnItemStorage.fromSlice(mutate s: slice): SbtnItemStorage {
//     val index = s.loadUint(256) as uint256;
//     val collectionAddress = s.loadAddress();
//     var ownerAddress: address? = null;
//     if (s.loadUint(1) != 0) {
//         ownerAddress = s.loadAddress();
//     }
//     val active = s.loadUint(1) != 0;
//     val revokedAt = s.loadUint(64) as uint64;
//     val individualContent = s.loadRef();
//     return {
//         index,
//         collectionAddress,
//         ownerAddress,
//         active,
//         revokedAt,
//         individualContent,
//     }
// }

// Init-only (no refs): contract data = SbtnItemData. Full (one ref): contract data = SbtnItemStorage.
// fun hasFullStorage(): bool {
//     return contract.getData().beginParse().remainingRefsCount() > 0
// }

// fun loadSbtnItemInitData(): SbtnItemData {
//     return SbtnItemData.fromSlice(contract.getData().beginParse())
// }

// fun loadSbtnItemStorage(): SbtnItemStorage {
//     var s = contract.getData().beginParse();
//     return SbtnItemStorage.fromSlice(mutate s);
// }

// fun saveSbtnItemStorage(full: SbtnItemStorage) {
//     contract.setData(full.toCell());
// }


// 

fun SbtnItemStorage.load() {
    return SbtnItemStorage.fromCell(contract.getData())
}

fun SbtnItemStorage.save(self) {
    contract.setData(self.toCell())
}


// SBTN collection storage (same idea as SBT: admin, next_item_index, content, sbtn_item_code).
struct SbtnCollectionContent {
    collectionMetadata: cell
}

struct SbtnCollectionStorage {
    adminAddress: address
    nextItemIndex: uint256
    content: Cell<SbtnCollectionContent>
    sbtnItemCode: cell
}

fun SbtnCollectionStorage.load() {
    return SbtnCollectionStorage.fromCell(contract.getData())
}

fun SbtnCollectionStorage.save(self) {
    contract.setData(self.toCell())
}

// Address derivation (SBTN_02 §2.2): StateInit with data = SbtnItemData only.
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
