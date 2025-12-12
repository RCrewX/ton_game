import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { encodeSetJettonMinterAddress, encodeSetGames, encodeRedirectMessage } from './types';

export type GameManagerConfig = {
    ownerAddress: Address;
};

export function gameManagerConfigToCell(config: GameManagerConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(null) // jettonMinterAddress: address?
        .storeMaybeRef(null) // games: cell?
        .endCell();
}

export class GameManager implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new GameManager(address);
    }

    static createFromConfig(config: GameManagerConfig, code: Cell, workchain = 0) {
        const data = gameManagerConfigToCell(config);
        const init = { code, data };
        return new GameManager(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendSetJettonMinterAddress(provider: ContractProvider, via: Sender, value: bigint, jettonMinterAddress: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeSetJettonMinterAddress({ jettonMinterAddress }),
        });
    }

    async sendSetGames(provider: ContractProvider, via: Sender, value: bigint, games: Cell) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeSetGames({ games }),
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

    async getJettonMinterAddress(provider: ContractProvider): Promise<Address | null> {
        const result = await provider.get('get_jetton_minter_address', []);
        return result.stack.readAddressOpt();
    }

    async getGames(provider: ContractProvider): Promise<Cell | null> {
        const result = await provider.get('get_games', []);
        return result.stack.readCellOpt();
    }
}

