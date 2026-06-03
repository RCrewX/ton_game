import { Address, beginCell, Cell, toNano } from '@ton/core';

// =============================================================================
// Retranslator (R*) PRIVATE types — registries, config messages and output
// bodies. Mirrors contracts/game_manager/retranslator.tolk. GM never imports
// these (decoupling invariant); they are reachable here only for tests/tooling.
// =============================================================================

// Gas costs (TON). Match contracts/game_manager/static.tolk.
export const GAS_COST_SET_JETTON_INFO = toNano('0.020');
export const GAS_COST_SET_GAMES_INFO = toNano('0.8'); // enough for several games + cashback
export const GAS_COST_SET_TOOLS_INFO = toNano('0.020');
export const GAS_COST_SET_ALLOW_BURN = toNano('0.015');
export const GAS_COST_REQUEST_BURN = toNano('0.015');

// Opcodes (must match retranslator.tolk / static.tolk).
export const ROpcodes = {
    OP_SET_JETTON_INFO: 0x53455401,
    OP_SET_GAMES_INFO: 0x7b2c3d4e,
    OP_SET_ALLOW_BURN: 0x7a8b9c0d,
    OP_SET_TOOLS_INFO: 0x53455403,
    OP_FORWARD_MINT_REQUEST: 0xf62ed009,
    OP_REQUEST_BURN: 0x8b9c0d1e,
    OP_JETTON_USED: 0xd7610922,
    OP_INTERNAL_TRANSFER_STEP: 0x178d4519,
    OP_MINT_NEW_JETTONS: 0x00000015,
    OP_ASK_TO_BURN: 0x595f07bc,
    // Printer recipe requests (wrapped in R1.data). Must match retranslator.tolk.
    OP_MINT_NFT: 0x4d6e6674,
    OP_MINT_SBT: 0x4d736274,
    OP_REVOKE_SBT: 0x52766b73,
    // ⚒ ANVIL edit recipes (wrapped in R1.data). Owner/GM-only on R*.
    OP_EDIT_NFT: 0x456e6674,
    OP_EDIT_SBT: 0x45736274,
    // Printer output bodies emitted by GM (R4). Must match the printer collections.
    OP_PRINTER_DEPLOY_NFT: 0x00000001,
    OP_PRINTER_DEPLOY_SBTN: 0x00000001,
    OP_PRINTER_REVOKE_SBTN_ITEM: 0x00000004,
    OP_PRINTER_EDIT_NFT_ITEM: 0x00000006,
    OP_PRINTER_EDIT_SBT_ITEM: 0x00000007,
} as const;

// ----- Registry shapes -----
export type JettonInfo = {
    jettonMinterAddress: Address;
    jettonWalletCode: Cell;
};

export type GamesInfo = {
    active_game: Address;
    all_games: Cell;
};

export type ToolsInfo = {
    feeNumerator: number;
    feeDenominator: number;
    feeCollector: Address | null;
    nftPrinterAddress: Address | null;
    sbtPrinterAddress: Address | null;
    extra: Cell | null;
};

// ----- Config message shapes -----
export type SetJettonInfo = { jettonInfo: Cell }; // Cell<JettonInfo>
export type SetGamesInfo = { gamesInfo: Cell }; // Cell<GamesInfo>
export type SetAllowBurn = { allow_burn: boolean };
export type SetToolsInfo = { toolsInfo: Cell }; // Cell<ToolsInfo>

// ----- Inbound request shapes (wrapped inside R1.data / R2.data) -----
export type ForwardMintRequest = { receiver: Address; amount: bigint };
export type RequestBurn = {
    queryId: bigint;
    jettonAmount: bigint;
    sendExcessesTo: Address | null;
    customPayload: Cell | null;
};

// ----- Output body shape (delivered by GM to a game) -----
export type JettonUsed = { jettonAmount: bigint; data: Cell };

// ----- Printer recipe request shapes (wrapped inside R1.data) -----
export type MintNft = { receiver: Address; content: Cell };
export type MintSbt = { receiver: Address; individualContent: Cell };
export type RevokeSbt = { queryId: bigint; itemAddress: Address };
// ⚒ ANVIL edit recipes: route an opaque content cell to an existing item.
export type EditNft = { itemAddress: Address; content: Cell };
export type EditSbt = { itemAddress: Address; content: Cell };

// ----- Structured item content schemas (built off-chain; opaque to GM/R*) -----
// NFTContent { origin: address, type: uint64, tier: uint64 } — matches
// contracts/printers/nft_printer/storage.tolk (Tolk field `itemType` == `type`).
export type NFTContent = { origin: Address; type: bigint | number; tier: bigint | number };
// SBTContent { tatoo: Cell<SnakeString> } — matches sbt_printer/storage.tolk.
export type SBTContent = { tatoo: Cell };

export function encodeNftContent(c: NFTContent): Cell {
    return beginCell()
        .storeAddress(c.origin)
        .storeUint(c.type, 64)
        .storeUint(c.tier, 64)
        .endCell();
}

export function decodeNftContent(cell: Cell): NFTContent {
    const s = cell.beginParse();
    return { origin: s.loadAddress(), type: s.loadUintBig(64), tier: s.loadUintBig(64) };
}

/** Build a SnakeString cell (short string stored as the cell's data tail). */
export function snakeString(s: string): Cell {
    return beginCell().storeStringTail(s).endCell();
}

export function encodeSbtContent(c: SBTContent): Cell {
    return beginCell().storeRef(c.tatoo).endCell();
}

export function decodeSbtContent(cell: Cell): SBTContent {
    return { tatoo: cell.beginParse().loadRef() };
}

// ----- Registry encoders -----
export function encodeJettonInfo(info: JettonInfo): Cell {
    return beginCell()
        .storeAddress(info.jettonMinterAddress)
        .storeRef(info.jettonWalletCode)
        .endCell();
}

export function encodeGamesInfo(info: GamesInfo): Cell {
    return beginCell().storeAddress(info.active_game).storeRef(info.all_games).endCell();
}

export function encodeToolsInfo(info: ToolsInfo): Cell {
    return beginCell()
        .storeUint(info.feeNumerator, 16)
        .storeUint(info.feeDenominator, 16)
        .storeAddress(info.feeCollector)
        .storeAddress(info.nftPrinterAddress)
        .storeAddress(info.sbtPrinterAddress)
        .storeMaybeRef(info.extra)
        .endCell();
}

// ----- Config encoders -----
export function encodeSetJettonInfo(msg: SetJettonInfo): Cell {
    return beginCell().storeUint(ROpcodes.OP_SET_JETTON_INFO, 32).storeRef(msg.jettonInfo).endCell();
}

export function encodeSetGamesInfo(msg: SetGamesInfo): Cell {
    return beginCell().storeUint(ROpcodes.OP_SET_GAMES_INFO, 32).storeRef(msg.gamesInfo).endCell();
}

export function encodeSetAllowBurn(msg: SetAllowBurn): Cell {
    return beginCell().storeUint(ROpcodes.OP_SET_ALLOW_BURN, 32).storeBit(msg.allow_burn).endCell();
}

export function encodeSetToolsInfo(msg: SetToolsInfo): Cell {
    return beginCell().storeUint(ROpcodes.OP_SET_TOOLS_INFO, 32).storeRef(msg.toolsInfo).endCell();
}

// ----- Inbound request encoders (to be wrapped in R1 before sending to GM) -----
export function encodeForwardMintRequest(msg: ForwardMintRequest): Cell {
    return beginCell()
        .storeUint(ROpcodes.OP_FORWARD_MINT_REQUEST, 32)
        .storeAddress(msg.receiver)
        .storeCoins(msg.amount)
        .endCell();
}

export function encodeRequestBurn(msg: RequestBurn): Cell {
    return beginCell()
        .storeUint(ROpcodes.OP_REQUEST_BURN, 32)
        .storeUint(msg.queryId, 64)
        .storeCoins(msg.jettonAmount)
        .storeAddress(msg.sendExcessesTo)
        .storeMaybeRef(msg.customPayload)
        .endCell();
}

export function encodeJettonUsed(msg: JettonUsed): Cell {
    return beginCell()
        .storeUint(ROpcodes.OP_JETTON_USED, 32)
        .storeCoins(msg.jettonAmount)
        .storeRef(msg.data)
        .endCell();
}

// ----- Printer recipe request encoders (wrapped in R1 before sending to GM) -----
export function encodeMintNft(msg: MintNft): Cell {
    return beginCell()
        .storeUint(ROpcodes.OP_MINT_NFT, 32)
        .storeAddress(msg.receiver)
        .storeRef(msg.content)
        .endCell();
}

export function encodeMintSbt(msg: MintSbt): Cell {
    return beginCell()
        .storeUint(ROpcodes.OP_MINT_SBT, 32)
        .storeAddress(msg.receiver)
        .storeRef(msg.individualContent)
        .endCell();
}

export function encodeRevokeSbt(msg: RevokeSbt): Cell {
    return beginCell()
        .storeUint(ROpcodes.OP_REVOKE_SBT, 32)
        .storeUint(msg.queryId, 64)
        .storeAddress(msg.itemAddress)
        .endCell();
}

// ⚒ ANVIL edit recipes (wrapped in R1 before sending to GM; owner/GM-only on R*).
export function encodeEditNft(msg: EditNft): Cell {
    return beginCell()
        .storeUint(ROpcodes.OP_EDIT_NFT, 32)
        .storeAddress(msg.itemAddress)
        .storeRef(msg.content)
        .endCell();
}

export function encodeEditSbt(msg: EditSbt): Cell {
    return beginCell()
        .storeUint(ROpcodes.OP_EDIT_SBT, 32)
        .storeAddress(msg.itemAddress)
        .storeRef(msg.content)
        .endCell();
}
