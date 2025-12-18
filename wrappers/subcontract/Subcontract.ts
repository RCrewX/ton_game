import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { encodeForward, encodeForwardWithInit, GAS_COST_FORWARD, GAS_COST_FORWARD_WITH_INIT, Forward, ForwardWithInit } from './types';

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

    async sendForward(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        destination: Address,
        messageBody: Cell,
        forwardTonAmount: bigint = toNano('0.1'),
        bounce: boolean = false,
        sendMode: number = SendMode.PAY_GAS_SEPARATELY,
        queryId: bigint = 0n
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeForward({ queryId, destination, forwardTonAmount, bounce, sendMode, messageBody }),
        });
    }

    async sendForwardWithInit(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        destination: Address,
        stateInit: Cell,
        messageBody: Cell,
        forwardTonAmount: bigint = toNano('0.1'),
        sendMode: number = SendMode.PAY_GAS_SEPARATELY,
        queryId: bigint = 0n
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeForwardWithInit({ queryId, destination, forwardTonAmount, sendMode, stateInit, messageBody }),
        });
    }

    // Backward compatibility: sendRedirectMessage now uses sendForward internally
    async sendRedirectMessage(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        destination: Address,
        messageBody: Cell,
        forwardTonAmount: bigint = toNano('0.1'),
        queryId: bigint = 0n
    ) {
        // Use sendForward with default bounce=false and sendMode=PAY_GAS_SEPARATELY
        await this.sendForward(
            provider,
            via,
            value,
            destination,
            messageBody,
            forwardTonAmount,
            false, // NoBounce (default for old RedirectMessage behavior)
            SendMode.PAY_GAS_SEPARATELY,
            queryId
        );
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

    async getSubcontractByIdAddress(provider: ContractProvider, ownerAddress: Address, id: bigint): Promise<Address> {
        const result = await provider.get('get_subcontract_by_id_address', [
            { type: 'slice', cell: beginCell().storeAddress(ownerAddress).endCell() },
            { type: 'int', value: id }
        ]);
        return result.stack.readAddress();
    }
}

