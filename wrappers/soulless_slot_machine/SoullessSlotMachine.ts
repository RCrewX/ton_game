import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { encodeTryLuck, encodeSetMintAmount, DEFAULT_MINT_AMOUNT } from './types';

export type SoullessSlotMachineConfig = {
    ownerAddress: Address; // GameManager address
    mintAmount?: bigint; // Optional, defaults to DEFAULT_MINT_AMOUNT
};

export function soullessSlotMachineConfigToCell(config: SoullessSlotMachineConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeCoins(config.mintAmount ?? DEFAULT_MINT_AMOUNT)
        .endCell();
}

export class SoullessSlotMachine implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new SoullessSlotMachine(address);
    }

    static createFromConfig(config: SoullessSlotMachineConfig, code: Cell, workchain = 0) {
        const data = soullessSlotMachineConfigToCell(config);
        const init = { code, data };
        return new SoullessSlotMachine(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendTryLuck(provider: ContractProvider, via: Sender, value: bigint, queryId: bigint = 0n) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeTryLuck({ queryId }),
        });
    }

    async sendSetMintAmount(provider: ContractProvider, via: Sender, value: bigint, mintAmount: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeSetMintAmount({ mintAmount }),
        });
    }

    async getOwnerAddress(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_owner_address', []);
        return result.stack.readAddress();
    }

    async getMintAmount(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_mint_amount', []);
        return result.stack.readBigNumber();
    }

    async getStorage(provider: ContractProvider): Promise<{ ownerAddress: Address; mintAmount: bigint }> {
        const result = await provider.get('get_storage', []);
        return {
            ownerAddress: result.stack.readAddress(),
            mintAmount: result.stack.readBigNumber(),
        };
    }
}
