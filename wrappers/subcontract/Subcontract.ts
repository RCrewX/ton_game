import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { encodeRedirectMessage } from './types';

export type SubcontractConfig = {
    ownerAddress: Address;
    id: bigint;
};

export function subcontractConfigToCell(config: SubcontractConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeUint(config.id, 256)
        .endCell();
}

export class Subcontract implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Subcontract(address);
    }

    static createFromConfig(config: SubcontractConfig, code: Cell, workchain = 0) {
        const data = subcontractConfigToCell(config);
        const init = { code, data };
        return new Subcontract(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendRedirectMessage(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        destination: Address,
        messageBody: Cell,
        forwardTonAmount: bigint = toNano('0.1'),
        queryId: bigint = 0n
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeRedirectMessage({ queryId, destination, messageBody, forwardTonAmount }),
        });
    }

    async getOwnerAddress(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_owner_address', []);
        return result.stack.readAddress();
    }

    async getId(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_id', []);
        return result.stack.readBigNumber();
    }

    async getSubcontractAddress(provider: ContractProvider, id: bigint): Promise<Address> {
        const result = await provider.get('get_subcontract_address', [
            { type: 'int', value: id }
        ]);
        return result.stack.readAddress();
    }
}

