import { Address, external, toNano } from '@ton/core';
import { SandboxContract } from '@ton/sandbox';
import { compile } from '@ton/blueprint';
import { keyPairFromSeed } from '@ton/crypto';
import { WalletContractV5R1 } from '@ton/ton';
import '@ton/test-utils';
import { ContractSystem, initContractSystem, cleanupContractSystem } from '../test_utils';
import { Ship } from '../../wrappers/ton_race_game/Ship';
import { CoordinateCell } from '../../wrappers/ton_race_game/CoordinateCell';
import { Opcodes as GameOpcodes } from '../../wrappers/ton_race_game/types';
import { ShipSession, buildSessionMoveExternal } from '../../wrappers/ship_session/ShipSession';
import { W5_AUTH_EXTENSION } from '../../wrappers/ship_session/types';

// MoveMode: LEFT=0 UP=1 RIGHT=2 EXIT=3
const MOVE_UP = 1;
const NOW = 1_900_000_000;
const MOVE_VALUE = toNano('1'); // matches the proven move-value in the game's own tests

/**
 * End-to-end PoC: prove on a real WalletContractV5R1 that an installed, constrained
 * ShipSession extension can move the user's ship with NO per-move owner signature,
 * and that the move's `src` is the WALLET (= the ship's userAddress) so the game
 * needs no change.
 */
describe('ShipSession — testnet PoC mechanic (real W5 wallet + ship + game)', () => {
    let SC: ContractSystem;
    let shipSessionCode: Awaited<ReturnType<typeof compile>>;

    // raw (un-opened) wallet — used to BUILD signed bodies + read address/init
    let wallet: WalletContractV5R1;
    let walletKp: { publicKey: Buffer; secretKey: Buffer };
    let sessionKp: { publicKey: Buffer; secretKey: Buffer };
    let ship: SandboxContract<Ship>;
    let session: SandboxContract<ShipSession>;

    beforeEach(async () => {
        SC = await initContractSystem();
        SC.blockchain.now = NOW;
        shipSessionCode = await compile('ShipSession');

        walletKp = keyPairFromSeed(Buffer.alloc(32, 0x11));
        sessionKp = keyPairFromSeed(Buffer.alloc(32, 0x22));

        // Real W5R1 wallet; this address is the ship's userAddress (W5-only, per the analysis).
        wallet = WalletContractV5R1.create({ workchain: 0, publicKey: walletKp.publicKey });

        // A ship owned by the W5 wallet.
        ship = SC.blockchain.openContract(
            Ship.createFromConfig(
                { userAddress: wallet.address, gameAddress: SC.game.address, coordinateCellCode: SC.coordinateCellCode },
                SC.shipCode,
            ),
        );
        await ship.sendDeploy(SC.ownerAccount.getSender(), toNano('5'));

        // The constrained extension, scoped to THIS wallet + THIS ship.
        session = SC.blockchain.openContract(
            ShipSession.createFromConfig(
                {
                    ownerWallet: wallet.address,
                    shipAddress: ship.address,
                    sessionPublicKey: BigInt('0x' + sessionKp.publicKey.toString('hex')),
                    expiresAt: NOW + 3600,
                    moveValue: MOVE_VALUE,
                    movesRemaining: 10,
                },
                shipSessionCode,
            ),
        );
        await session.sendDeploy(SC.ownerAccount.getSender(), toNano('2'));
    }, 120000);

    afterEach(() => {
        cleanupContractSystem(SC);
        SC = null as any;
    });

    // Fund the wallet, then (ONE owner signature) install ShipSession as an extension.
    async function installExtension() {
        await SC.ownerAccount.send({ to: wallet.address, value: toNano('10'), bounce: false });
        const addExt = await wallet.createAddExtension({
            seqno: 0,
            secretKey: walletKp.secretKey,
            extensionAddress: session.address,
        });
        await SC.blockchain.sendMessage(external({ to: wallet.address, init: wallet.init, body: addExt }));
        // Confirm registration via the wallet's own getter.
        const walletC = SC.blockchain.openContract(wallet);
        const exts: Address[] = await walletC.getExtensionsArray();
        expect(exts.some((a) => a.equals(session.address))).toBe(true);
    }

    function sessionMove(seqno: number, moveMode: number) {
        return buildSessionMoveExternal({
            sessionSecretKey: sessionKp.secretKey,
            seqno,
            validUntil: NOW + 600,
            moveMode,
            shipAddress: ship.address,
            shipSessionAddress: session.address,
        });
    }

    it('moves the ship with NO per-move owner signature; move src == wallet (userAddress)', async () => {
        await installExtension();

        // Session-key signed (NO owner popup) → ShipSession → wallet(extn) → ship.
        const res = await SC.blockchain.sendMessage(external({ to: session.address, body: sessionMove(0, MOVE_UP) }));

        // 1) ShipSession triggers the wallet via the extension opcode.
        expect(res.transactions).toHaveTransaction({
            from: session.address,
            to: wallet.address,
            op: W5_AUTH_EXTENSION,
            success: true,
        });

        // 2) PRIMARY POC ASSERTION: the move reaches the ship FROM the wallet — i.e.
        //    src == wallet == userAddress, so the game's `sender == userAddress` holds.
        expect(res.transactions).toHaveTransaction({
            from: wallet.address,
            to: ship.address,
            op: GameOpcodes.OP_REQUEST_TO_MOVE,
            success: true,
        });

        // 3) Game move pipeline runs unchanged.
        const cc_old = SC.blockchain.openContract(
            CoordinateCell.createFromConfig({ gameAddress: SC.game.address, xy: { x: 0n, y: 0n }, shipCode: SC.shipCode }, SC.coordinateCellCode),
        );
        expect(res.transactions).toHaveTransaction({
            from: ship.address,
            to: cc_old.address,
            op: GameOpcodes.OP_MOVE_SHIP_TO_CC,
            success: true,
        });
        expect(res.transactions).toHaveTransaction({
            to: ship.address,
            op: GameOpcodes.OP_MOVE_END,
            success: true,
        });

        // 4) Ship actually advanced (0,0) -> (0,1), and the session metered the move.
        const gd = await ship.getCurrentGameData();
        expect(gd).not.toBeNull();
        expect(gd!.xy.x).toBe(0n);
        expect(gd!.xy.y).toBe(1n);
        expect(await session.getSeqno()).toBe(1);
        expect(await session.getMovesRemaining()).toBe(9);

        // A second session move (still no owner signature) advances again.
        await SC.blockchain.sendMessage(external({ to: session.address, body: sessionMove(1, MOVE_UP) }));
        const gd2 = await ship.getCurrentGameData();
        expect(gd2!.xy.y).toBe(2n);
        expect(await session.getSeqno()).toBe(2);
    });

    it('wallet-side revoke (remove_extension) stops the session moving the ship', async () => {
        await installExtension();
        // one good move first
        await SC.blockchain.sendMessage(external({ to: session.address, body: sessionMove(0, MOVE_UP) }));
        const before = await ship.getCurrentGameData();
        expect(before!.xy.y).toBe(1n);

        // Owner removes the extension (one owner signature). seqno is now 1 on the wallet.
        const rm = await wallet.createRemoveExtension({
            seqno: 1,
            secretKey: walletKp.secretKey,
            extensionAddress: session.address,
            timeout: NOW + 600, // blockchain.now is set to NOW; default timeout would be "expired"
        });
        // wallet already deployed → do NOT re-send stateInit
        await SC.blockchain.sendMessage(external({ to: wallet.address, body: rm }));

        // The session still emits to the wallet, but the wallet now rejects it: the
        // move never reaches the ship.
        const res = await SC.blockchain.sendMessage(external({ to: session.address, body: sessionMove(1, MOVE_UP) }));
        expect(res.transactions).not.toHaveTransaction({
            from: wallet.address,
            to: ship.address,
            op: GameOpcodes.OP_REQUEST_TO_MOVE,
        });
        const after = await ship.getCurrentGameData();
        expect(after!.xy.y).toBe(1n); // unchanged
    });

    it('an expired session can no longer move the ship (time-box)', async () => {
        await installExtension();
        // one good move first
        await SC.blockchain.sendMessage(external({ to: session.address, body: sessionMove(0, MOVE_UP) }));
        expect((await ship.getCurrentGameData())!.xy.y).toBe(1n);

        // Warp past expiry. ShipSession rejects before ever touching the wallet.
        SC.blockchain.now = NOW + 4000;
        const body = buildSessionMoveExternal({
            sessionSecretKey: sessionKp.secretKey,
            seqno: 1,
            validUntil: NOW + 5000, // request itself still "fresh", but session is expired
            moveMode: MOVE_UP,
            shipAddress: ship.address,
            shipSessionAddress: session.address,
        });
        let threw = false;
        try {
            await SC.blockchain.sendMessage(external({ to: session.address, body }));
        } catch {
            threw = true;
        }
        // rejected (threw or no state change) — ship unchanged, seqno not bumped
        expect((await ship.getCurrentGameData())!.xy.y).toBe(1n);
        expect(await session.getSeqno()).toBe(1);
        expect(threw || true).toBe(true);
    });
});
