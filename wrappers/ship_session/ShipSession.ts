import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';
import { sign } from '@ton/crypto';
import { encodeExternalEnvelope, encodeRevokeSession, encodeSessionInner, SessionInner } from './types';

// Storage layout MUST match struct ShipSessionStorage in static.tolk:
//   ownerWallet:address shipAddress:address sessionPublicKey:uint256
//   expiresAt:uint32 seqno:uint32 moveValue:coins movesRemaining:uint32
export type ShipSessionConfig = {
    ownerWallet: Address; // the W5 wallet this extension is installed on
    shipAddress: Address; // the ONE ship this session may move
    sessionPublicKey: bigint; // ephemeral browser key (Ed25519, 256 bits)
    expiresAt: number; // unix seconds — session time-box
    moveValue: bigint; // value forwarded per move (the per-move cap)
    movesRemaining: number; // move budget
    seqno?: number; // defaults to 0 at install
};

export function shipSessionConfigToCell(config: ShipSessionConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerWallet)
        .storeAddress(config.shipAddress)
        .storeUint(config.sessionPublicKey, 256)
        .storeUint(config.expiresAt, 32)
        .storeUint(config.seqno ?? 0, 32)
        .storeCoins(config.moveValue)
        .storeUint(config.movesRemaining, 32)
        .endCell();
}

/**
 * Build the signed external message body (envelope) that authorizes ONE move.
 * Signed by the SESSION key — never the owner wallet key.
 *
 * Sandbox note: the @ton ContractProvider does not expose external(), so tests
 * deliver this via `blockchain.sendMessage(external({ to, body }))`.
 */
export function buildSessionMoveExternal(args: {
    sessionSecretKey: Buffer;
    seqno: number;
    validUntil: number;
    moveMode: number;
    shipAddress: Address;
    shipSessionAddress: Address; // bound into the signature (anti cross-instance replay)
}): Cell {
    const inner: SessionInner = {
        seqno: args.seqno,
        validUntil: args.validUntil,
        moveMode: args.moveMode,
        shipAddress: args.shipAddress,
        selfAddress: args.shipSessionAddress,
    };
    const innerCell = encodeSessionInner(inner);
    const signature = sign(innerCell.hash(), args.sessionSecretKey);
    return encodeExternalEnvelope(signature, innerCell);
}

export class ShipSession implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new ShipSession(address);
    }

    static createFromConfig(config: ShipSessionConfig, code: Cell, workchain = 0) {
        const data = shipSessionConfigToCell(config);
        const init = { code, data };
        return new ShipSession(contractAddress(workchain, init), init);
    }

    // Deploy by funding the contract (empty body → reserve-only path). The value
    // becomes the float that pays for trigger hops.
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint = toNano('0.2')) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // Plain top-up of the trigger-hop float.
    async sendTopUp(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // Owner-only hard revoke (must come from the owner wallet address).
    async sendRevoke(provider: ContractProvider, via: Sender, value: bigint = toNano('0.02'), queryId: bigint = 0n) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeRevokeSession(queryId),
        });
    }

    async getOwnerWallet(provider: ContractProvider): Promise<Address> {
        const res = await provider.get('get_owner_wallet', []);
        return res.stack.readAddress();
    }

    async getShipAddress(provider: ContractProvider): Promise<Address> {
        const res = await provider.get('get_ship_address', []);
        return res.stack.readAddress();
    }

    async getSessionPublicKey(provider: ContractProvider): Promise<bigint> {
        const res = await provider.get('get_session_public_key', []);
        return res.stack.readBigNumber();
    }

    async getExpiresAt(provider: ContractProvider): Promise<number> {
        const res = await provider.get('get_expires_at', []);
        return res.stack.readNumber();
    }

    async getSeqno(provider: ContractProvider): Promise<number> {
        const res = await provider.get('get_seqno', []);
        return res.stack.readNumber();
    }

    async getMoveValue(provider: ContractProvider): Promise<bigint> {
        const res = await provider.get('get_move_value', []);
        return res.stack.readBigNumber();
    }

    async getMovesRemaining(provider: ContractProvider): Promise<number> {
        const res = await provider.get('get_moves_remaining', []);
        return res.stack.readNumber();
    }

    async getTonBalance(provider: ContractProvider): Promise<bigint> {
        const res = await provider.get('tonBalance', []);
        return res.stack.readBigNumber();
    }
}
