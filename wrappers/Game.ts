import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type GameConfig = {
    managerAddress: Address,
    shipCode: Cell,
    coordinateCellCode: Cell,
};

export function gameConfigToCell(config: GameConfig): Cell {
    return beginCell()
    .storeAddress(config.managerAddress)
    .storeRef(config.shipCode)
    .storeRef(config.coordinateCellCode)
    .endCell();
}

export class Game implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Game(address);
    }

    static createFromConfig(config: GameConfig, code: Cell, workchain = 0) {
        const data = gameConfigToCell(config);
        const init = { code, data };
        return new Game(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
