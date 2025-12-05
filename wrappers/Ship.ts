import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ShipConfig = {
    userAddress: Address,
    gameAddress: Address,
    coordinateCellCode: Cell,
};

export function shipConfigToCell(config: ShipConfig): Cell {
    return beginCell().storeAddress(config.userAddress).storeAddress(config.gameAddress).storeRef(config.coordinateCellCode).endCell();
}

export class Ship implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Ship(address);
    }

    static createFromConfig(config: ShipConfig, code: Cell, workchain = 0) {
        const data = shipConfigToCell(config);
        const init = { code, data };
        return new Ship(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMove(provider: ContractProvider, via: Sender, value: bigint, move: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
