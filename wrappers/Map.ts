import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type MapConfig = {};

export function mapConfigToCell(config: MapConfig): Cell {
    return beginCell().endCell();
}

export class Map implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Map(address);
    }

    static createFromConfig(config: MapConfig, code: Cell, workchain = 0) {
        const data = mapConfigToCell(config);
        const init = { code, data };
        return new Map(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
