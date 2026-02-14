/**
 * SBTN-specific behavior (TEP-6666): owner-bound addressing, sbtn_init once, get_sbtn_address, get_sbtn_item_code.
 */
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import { SBTNCollection } from '../../wrappers/tep/sbtn/SBTNCollection';
import { SBTNItem } from '../../wrappers/tep/sbtn/SBTNItem';
import { calcSbtnItemAddress, Op } from '../../wrappers/tep/sbtn/types';
import '@ton/test-utils';
import { randomAddress } from '@ton/test-utils';
import { activateTVM12, GasLogAndSave } from '../helpers';

describe('SBTN-specific', () => {
    let GAS_LOG = new GasLogAndSave('sbtn_specific');
    let sbtnItemCode: Cell;
    let sbtnCollectionCode: Cell;

    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let sbtnCollection: SandboxContract<SBTNCollection>;

    const ERROR_ALREADY_INITIALIZED = 961;
    const ERROR_NOT_FROM_COLLECTION = 960;

    beforeAll(async () => {
        sbtnItemCode = await compile('SBTNItem');
        sbtnCollectionCode = await compile('SBTNCollection');
        GAS_LOG.rememberBocSize('sbtn-item', sbtnItemCode);
        GAS_LOG.rememberBocSize('sbtn-collection', sbtnCollectionCode);
    });
    afterAll(() => {
        GAS_LOG.saveCurrentRunAfterAll();
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        activateTVM12(blockchain);
        owner = await blockchain.treasury('owner');
        sbtnCollection = blockchain.openContract(
            SBTNCollection.createFromConfig(
                { sbtnItemCode, adminAddress: owner.address },
                sbtnCollectionCode,
            ),
        );
        await sbtnCollection.sendDeploy(owner.getSender(), toNano('0.05'));
    });

    describe('owner-bound addressing', () => {
        it('get_sbtn_address(ownerA, 0) equals deployed item address', async () => {
            const ownerA = randomAddress();
            await sbtnCollection.sendDeploySbtn(owner.getSender(), {
                ownerAddress: ownerA,
                index: 0n,
                value: toNano('0.1'),
                attachTonAmount: toNano('0.05'),
                individualContent: beginCell().endCell(),
            });
            const computed = await sbtnCollection.getSbtnAddress(ownerA, 0);
            const expected = calcSbtnItemAddress(ownerA, sbtnCollection.address, 0n, sbtnItemCode);
            expect(computed.equals(expected)).toBe(true);
            const sbtnItem = blockchain.openContract(SBTNItem.createFromAddress(computed));
            const data = await sbtnItem.getNftData();
            expect(data.init).toBe(true);
            expect(data.ownerAddress).toEqualAddress(ownerA);
        });

        it('same (owner, index) yields same address; different owner or index yields different address', async () => {
            const ownerA = randomAddress();
            const ownerB = randomAddress();
            const addrA0 = calcSbtnItemAddress(ownerA, sbtnCollection.address, 0n, sbtnItemCode);
            const addrA0Again = calcSbtnItemAddress(ownerA, sbtnCollection.address, 0n, sbtnItemCode);
            const addrA1 = calcSbtnItemAddress(ownerA, sbtnCollection.address, 1n, sbtnItemCode);
            const addrB0 = calcSbtnItemAddress(ownerB, sbtnCollection.address, 0n, sbtnItemCode);
            expect(addrA0.equals(addrA0Again)).toBe(true);
            expect(addrA0.equals(addrA1)).toBe(false);
            expect(addrA0.equals(addrB0)).toBe(false);
        });
    });

    describe('sbtn_init once', () => {
        it('second sbtn_init to same item is rejected (already initialized)', async () => {
            const ownerA = randomAddress();
            await sbtnCollection.sendDeploySbtn(owner.getSender(), {
                ownerAddress: ownerA,
                index: 0n,
                value: toNano('0.1'),
                attachTonAmount: toNano('0.05'),
                individualContent: beginCell().endCell(),
            });
            const addr = await sbtnCollection.getSbtnAddress(ownerA, 0);
            const sbtnItem = blockchain.openContract(SBTNItem.createFromAddress(addr));
            expect((await sbtnItem.getNftData()).init).toBe(true);
            const result = await owner.send({
                to: sbtnItem.address,
                value: toNano('0.05'),
                body: beginCell()
                    .storeUint(Op.SbtnInit, 32)
                    .storeUint(0, 64)
                    .storeRef(beginCell().endCell())
                    .endCell(),
            });
            expect(result.transactions).toHaveTransaction({
                from: owner.address,
                to: sbtnItem.address,
                op: Op.SbtnInit,
                success: false,
                exitCode: ERROR_ALREADY_INITIALIZED,
            });
        });
    });

    describe('get_sbtn_item_code', () => {
        it('returns code equal to compiled SBTNItem', async () => {
            const codeFromCollection = await sbtnCollection.getSbtnItemCode();
            expect(codeFromCollection.equals(sbtnItemCode)).toBe(true);
        });
    });

    describe('get_collection_data', () => {
        it('returns next_item_index, collection content, admin', async () => {
            const data = await sbtnCollection.getCollectionData();
            expect(data.nextItemIndex).toBe(0n);
            expect(data.adminAddress).toEqualAddress(owner.address);
        });

        it('next_item_index advances after minting new type id', async () => {
            const ownerA = randomAddress();
            await sbtnCollection.sendDeploySbtn(owner.getSender(), {
                ownerAddress: ownerA,
                index: 0n,
                value: toNano('0.1'),
                attachTonAmount: toNano('0.05'),
                individualContent: beginCell().endCell(),
            });
            const dataAfter = await sbtnCollection.getCollectionData();
            expect(dataAfter.nextItemIndex).toBe(1n);
        });
    });
});
