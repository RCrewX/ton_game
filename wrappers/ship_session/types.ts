import { Address, beginCell, Cell, toNano } from '@ton/core';

// Gas / value constants — mirror contracts/ship_session/static.tolk
export const BASIC_STORAGE_TAX = toNano('0.01');
export const TRIGGER_GAS = toNano('0.05'); // value of the extn hop ShipSession -> wallet
export const GAS_MARGIN = toNano('0.02');

// Wallet-v5r1 wire-format tags (must match the contract + @ton/ton).
export const W5_AUTH_EXTENSION = 0x6578746e; // "extn"
export const W5_ACTION_SEND_MSG = 0x0ec3c86d; // action_send_msg

// Game move opcode (must match contracts/ton_race_game/static/messages.tolk).
export const OP_REQUEST_TO_MOVE = 0xf2a70b07;

// Internal control opcode.
export const OP_REVOKE_SESSION = 0x72766b65; // "rvke"

// Error codes — mirror static.tolk (940+ range).
export const ShipSessionErrors = {
    ERR_INVALID_SIGNATURE: 950,
    ERR_BAD_SEQNO: 951,
    ERR_EXPIRED: 952,
    ERR_SESSION_EXPIRED: 953,
    ERR_WRONG_TARGET: 954,
    ERR_WRONG_BINDING: 955,
    ERR_INVALID_MOVE_MODE: 956,
    ERR_BUDGET_EXHAUSTED: 957,
    ERR_INSUFFICIENT_FLOAT: 958,
    ERR_INVALID_OWNER_SENDER: 959,
} as const;

// The signed payload. Its cell hash is what the session key signs.
// Layout MUST match struct SessionInner in static.tolk:
//   seqno:uint32 validUntil:uint32 moveMode:uint8 shipAddress:address selfAddress:address
export type SessionInner = {
    seqno: number;
    validUntil: number;
    moveMode: number; // MoveMode uint8: LEFT=0 UP=1 RIGHT=2 EXIT=3
    shipAddress: Address;
    selfAddress: Address;
};

export function encodeSessionInner(inner: SessionInner): Cell {
    return beginCell()
        .storeUint(inner.seqno, 32)
        .storeUint(inner.validUntil, 32)
        .storeUint(inner.moveMode, 8)
        .storeAddress(inner.shipAddress)
        .storeAddress(inner.selfAddress)
        .endCell();
}

// External envelope: signature(512) ++ ^inner. Matches struct ExternalEnvelope.
export function encodeExternalEnvelope(signature: Buffer, inner: Cell): Cell {
    return beginCell()
        .storeBuffer(signature) // 512 bits
        .storeRef(inner)
        .endCell();
}

export function encodeRevokeSession(queryId: bigint = 0n): Cell {
    return beginCell()
        .storeUint(OP_REVOKE_SESSION, 32)
        .storeUint(queryId, 64)
        .endCell();
}
