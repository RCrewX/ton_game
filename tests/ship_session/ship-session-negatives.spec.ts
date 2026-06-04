import { Address, beginCell, Cell, external, loadMessageRelaxed, toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { compile } from '@ton/blueprint';
import { keyPairFromSeed, sign } from '@ton/crypto';
import '@ton/test-utils';
import { ShipSession, buildSessionMoveExternal } from '../../wrappers/ship_session/ShipSession';
import {
    encodeExternalEnvelope,
    encodeSessionInner,
    OP_REQUEST_TO_MOVE,
    ShipSessionErrors,
    W5_ACTION_SEND_MSG,
    W5_AUTH_EXTENSION,
} from '../../wrappers/ship_session/types';

// MoveMode (mirrors the game enum): LEFT=0 UP=1 RIGHT=2 EXIT=3.
const MOVE_UP = 1;

const NOW = 1_900_000_000; // fixed clock so validUntil/expiresAt are deterministic
const MOVE_VALUE = toNano('0.3');

describe('ShipSession — safety negatives (unit, no game)', () => {
    let blockchain: Blockchain;
    let code: Cell;
    let deployer: SandboxContract<TreasuryContract>;
    let ownerWallet: SandboxContract<TreasuryContract>; // stands in for the W5 wallet
    let ship: SandboxContract<TreasuryContract>; // stands in for the ship address
    let other: SandboxContract<TreasuryContract>;
    let sessionKp: { publicKey: Buffer; secretKey: Buffer };

    beforeAll(async () => {
        code = await compile('ShipSession');
    });

    async function deploySession(opts: { expiresAt: number; movesRemaining: number }) {
        const ss = blockchain.openContract(
            ShipSession.createFromConfig(
                {
                    ownerWallet: ownerWallet.address,
                    shipAddress: ship.address,
                    sessionPublicKey: BigInt('0x' + sessionKp.publicKey.toString('hex')),
                    expiresAt: opts.expiresAt,
                    moveValue: MOVE_VALUE,
                    movesRemaining: opts.movesRemaining,
                },
                code,
            ),
        );
        await ss.sendDeploy(deployer.getSender(), toNano('1'));
        return ss;
    }

    // Try to deliver an external; resolve true if it was REJECTED (threw or aborted
    // without bumping seqno), false if it went through.
    async function deliverExpectRejected(ss: SandboxContract<ShipSession>, body: Cell): Promise<boolean> {
        const before = await ss.getSeqno();
        try {
            await blockchain.sendMessage(external({ to: ss.address, body }));
        } catch {
            /* external not accepted — rejected */
        }
        const after = await ss.getSeqno();
        return after === before;
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = NOW;
        deployer = await blockchain.treasury('deployer');
        ownerWallet = await blockchain.treasury('ownerWallet');
        ship = await blockchain.treasury('ship');
        other = await blockchain.treasury('other');
        // deterministic, VALID session keypair (seed-derived so pubkey matches secret)
        sessionKp = keyPairFromSeed(Buffer.alloc(32, 0xa1));
    });

    it('deploys and exposes the configured (immutable) scope', async () => {
        const ss = await deploySession({ expiresAt: NOW + 3600, movesRemaining: 5 });
        expect((await ss.getOwnerWallet()).equals(ownerWallet.address)).toBe(true);
        expect((await ss.getShipAddress()).equals(ship.address)).toBe(true);
        expect(await ss.getSeqno()).toBe(0);
        expect(await ss.getMovesRemaining()).toBe(5);
        expect(await ss.getMoveValue()).toBe(MOVE_VALUE);
    });

    // Properties 1,2,3,4 — proven by construction: a valid session request makes the
    // contract emit EXACTLY ONE extn action: RequestToMove(mode) to the stored ship,
    // value == cap, and ZERO extended actions (no add/remove-extension).
    it('emits a single bounded extn move action to the stored ship only (props 1-4)', async () => {
        const ss = await deploySession({ expiresAt: NOW + 3600, movesRemaining: 5 });

        const body = buildSessionMoveExternal({
            sessionSecretKey: sessionKp.secretKey,
            seqno: 0,
            validUntil: NOW + 600,
            moveMode: MOVE_UP,
            shipAddress: ship.address,
            shipSessionAddress: ss.address,
        });

        const res = await blockchain.sendMessage(external({ to: ss.address, body }));

        // ShipSession -> ownerWallet carries the W5 extension opcode.
        expect(res.transactions).toHaveTransaction({
            from: ss.address,
            to: ownerWallet.address,
            op: W5_AUTH_EXTENSION,
            success: true,
        });

        // Decode the emitted extn body and prove the action is fully constrained.
        const tx = res.transactions.find(
            (t) =>
                t.inMessage?.info.type === 'internal' &&
                (t.inMessage.info.dest as Address).equals(ownerWallet.address),
        );
        expect(tx).toBeDefined();
        const s = tx!.inMessage!.body.beginParse();
        expect(s.loadUint(32)).toBe(W5_AUTH_EXTENSION);
        s.loadUint(64); // queryId
        const outList = s.loadMaybeRef();
        expect(outList).not.toBeNull();
        expect(s.loadBit()).toBe(false); // has_other_actions == 0  -> property 4 (no add/remove ext)

        const ol = outList!.beginParse();
        ol.loadRef(); // prev OutList (empty)
        expect(ol.loadUint(32)).toBe(W5_ACTION_SEND_MSG);
        ol.loadUint(8); // send mode
        const relaxed = loadMessageRelaxed(ol.loadRef().beginParse());
        expect(ol.remainingRefs).toBe(0); // exactly ONE action

        // Destination is the stored ship only (property 1).
        expect(relaxed.info.type).toBe('internal');
        if (relaxed.info.type === 'internal') {
            expect((relaxed.info.dest as Address).equals(ship.address)).toBe(true);
            // Value is exactly the configured cap, never attacker-chosen (property 3).
            expect(relaxed.info.value.coins).toBe(MOVE_VALUE);
        }
        // Opcode is RequestToMove and the mode is the requested one (property 2).
        const moveSlice = relaxed.body.beginParse();
        expect(moveSlice.loadUint(32)).toBe(OP_REQUEST_TO_MOVE);
        expect(moveSlice.loadUint(8)).toBe(MOVE_UP);

        // State advanced: one seqno, one budget unit consumed.
        expect(await ss.getSeqno()).toBe(1);
        expect(await ss.getMovesRemaining()).toBe(4);
    });

    it('rejects a request not signed by the session key (property 6)', async () => {
        const ss = await deploySession({ expiresAt: NOW + 3600, movesRemaining: 5 });
        const wrongKp = keyPairFromSeed(Buffer.alloc(32, 0xb2));
        const inner = encodeSessionInner({
            seqno: 0,
            validUntil: NOW + 600,
            moveMode: MOVE_UP,
            shipAddress: ship.address,
            selfAddress: ss.address,
        });
        const body = encodeExternalEnvelope(sign(inner.hash(), wrongKp.secretKey), inner);
        expect(await deliverExpectRejected(ss, body)).toBe(true);
    });

    it('rejects replay / stale / future seqno (property 5)', async () => {
        const ss = await deploySession({ expiresAt: NOW + 3600, movesRemaining: 5 });
        const mk = (seqno: number) =>
            buildSessionMoveExternal({
                sessionSecretKey: sessionKp.secretKey,
                seqno,
                validUntil: NOW + 600,
                moveMode: MOVE_UP,
                shipAddress: ship.address,
                shipSessionAddress: ss.address,
            });

        // First move (seqno 0) goes through.
        await blockchain.sendMessage(external({ to: ss.address, body: mk(0) }));
        expect(await ss.getSeqno()).toBe(1);

        // Replaying seqno 0 is rejected; jumping to seqno 99 is rejected.
        expect(await deliverExpectRejected(ss, mk(0))).toBe(true);
        expect(await deliverExpectRejected(ss, mk(99))).toBe(true);
        expect(await ss.getSeqno()).toBe(1);
    });

    it('rejects an expired request (validUntil in the past)', async () => {
        const ss = await deploySession({ expiresAt: NOW + 3600, movesRemaining: 5 });
        const body = buildSessionMoveExternal({
            sessionSecretKey: sessionKp.secretKey,
            seqno: 0,
            validUntil: NOW - 10,
            moveMode: MOVE_UP,
            shipAddress: ship.address,
            shipSessionAddress: ss.address,
        });
        expect(await deliverExpectRejected(ss, body)).toBe(true);
    });

    it('rejects once the whole session has expired (time-box)', async () => {
        const ss = await deploySession({ expiresAt: NOW - 10, movesRemaining: 5 });
        const body = buildSessionMoveExternal({
            sessionSecretKey: sessionKp.secretKey,
            seqno: 0,
            validUntil: NOW + 600, // request still fresh, but session is dead
            moveMode: MOVE_UP,
            shipAddress: ship.address,
            shipSessionAddress: ss.address,
        });
        expect(await deliverExpectRejected(ss, body)).toBe(true);
    });

    it('rejects a move mode outside {LEFT,UP,RIGHT,EXIT} (property 2)', async () => {
        const ss = await deploySession({ expiresAt: NOW + 3600, movesRemaining: 5 });
        const body = buildSessionMoveExternal({
            sessionSecretKey: sessionKp.secretKey,
            seqno: 0,
            validUntil: NOW + 600,
            moveMode: 4, // out of range
            shipAddress: ship.address,
            shipSessionAddress: ss.address,
        });
        expect(await deliverExpectRejected(ss, body)).toBe(true);
    });

    it('rejects once the move budget is exhausted (property 3)', async () => {
        const ss = await deploySession({ expiresAt: NOW + 3600, movesRemaining: 1 });
        // first move consumes the only budget unit
        await blockchain.sendMessage(
            external({
                to: ss.address,
                body: buildSessionMoveExternal({
                    sessionSecretKey: sessionKp.secretKey,
                    seqno: 0,
                    validUntil: NOW + 600,
                    moveMode: MOVE_UP,
                    shipAddress: ship.address,
                    shipSessionAddress: ss.address,
                }),
            }),
        );
        expect(await ss.getMovesRemaining()).toBe(0);
        // second move (next seqno) is rejected
        const body = buildSessionMoveExternal({
            sessionSecretKey: sessionKp.secretKey,
            seqno: 1,
            validUntil: NOW + 600,
            moveMode: MOVE_UP,
            shipAddress: ship.address,
            shipSessionAddress: ss.address,
        });
        expect(await deliverExpectRejected(ss, body)).toBe(true);
    });

    it('rejects a request whose signed target is a different address (property 1)', async () => {
        const ss = await deploySession({ expiresAt: NOW + 3600, movesRemaining: 5 });
        // validly session-signed, but inner.shipAddress != stored ship
        const inner = encodeSessionInner({
            seqno: 0,
            validUntil: NOW + 600,
            moveMode: MOVE_UP,
            shipAddress: other.address, // tampered target
            selfAddress: ss.address,
        });
        const body = encodeExternalEnvelope(sign(inner.hash(), sessionKp.secretKey), inner);
        expect(await deliverExpectRejected(ss, body)).toBe(true);
    });

    it('rejects a signature bound to a different ShipSession instance (anti cross-replay)', async () => {
        const ss = await deploySession({ expiresAt: NOW + 3600, movesRemaining: 5 });
        const inner = encodeSessionInner({
            seqno: 0,
            validUntil: NOW + 600,
            moveMode: MOVE_UP,
            shipAddress: ship.address,
            selfAddress: other.address, // wrong instance binding
        });
        const body = encodeExternalEnvelope(sign(inner.hash(), sessionKp.secretKey), inner);
        expect(await deliverExpectRejected(ss, body)).toBe(true);
    });

    it('owner can hard-revoke; non-owner cannot; revoked session is dead', async () => {
        const ss = await deploySession({ expiresAt: NOW + 3600, movesRemaining: 5 });

        // Non-owner revoke is rejected (state unchanged).
        await ss.sendRevoke(other.getSender());
        expect(await ss.getMovesRemaining()).toBe(5);
        expect(await ss.getExpiresAt()).toBe(NOW + 3600);

        // Owner revoke zeroes the session.
        await ss.sendRevoke(ownerWallet.getSender());
        expect(await ss.getMovesRemaining()).toBe(0);
        expect(await ss.getExpiresAt()).toBe(0);

        // A previously-valid request is now rejected.
        const body = buildSessionMoveExternal({
            sessionSecretKey: sessionKp.secretKey,
            seqno: 0,
            validUntil: NOW + 600,
            moveMode: MOVE_UP,
            shipAddress: ship.address,
            shipSessionAddress: ss.address,
        });
        expect(await deliverExpectRejected(ss, body)).toBe(true);
    });
});
