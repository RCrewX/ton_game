import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { encodeDeployJetton, encodeSetGamesInfo, encodeGamesInfo, encodeRedirectMessage, encodeSetAllowBurn, encodeRequestBurn, DeployJetton, SetGamesInfo, GamesInfo } from './types';

export type GameManagerConfig = {
    ownerAddress: Address;
};

export function gameManagerConfigToCell(config: GameManagerConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeBit(false) // allow_burn: bool (default false)
        .storeCoins(toNano('0.01')) // my_little_tax: coins (0.01 by default)
        .storeMaybeRef(null) // jettonInfo: Cell<JettonInfo>?
        .storeMaybeRef(null) // gamesInfo: Cell<GamesInfo>?
        .storeMaybeRef(null) // config: cell?
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

    async sendDeployJetton(provider: ContractProvider, via: Sender, value: bigint, deployJetton: DeployJetton) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeDeployJetton(deployJetton),
        });
    }

    async sendSetGamesInfo(provider: ContractProvider, via: Sender, value: bigint, gamesInfo: GamesInfo) {
        const gamesInfoCell = encodeGamesInfo(gamesInfo);
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeSetGamesInfo({ gamesInfo: gamesInfoCell }),
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

    async sendSetAllowBurn(provider: ContractProvider, via: Sender, value: bigint, allow_burn: boolean) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeSetAllowBurn({ allow_burn }),
        });
    }

    async sendRequestBurn(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        jettonAmount: bigint,
        sendExcessesTo: Address | null = null,
        customPayload: Cell | null = null,
        queryId: bigint = 0n
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeRequestBurn({ queryId, jettonAmount, sendExcessesTo, customPayload }),
        });
    }

    async getAllowBurn(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_allow_burn', []);
        return result.stack.readBoolean();
    }

    async getJettonInfo(provider: ContractProvider): Promise<{ jettonMinterAddress: Address; jettonWalletCode: Cell } | null> {
        const result = await provider.get('get_jetton_info', []);
        const jettonInfoCell = result.stack.readCellOpt();
        if (!jettonInfoCell) {
            return null;
        }
        const slice = jettonInfoCell.beginParse();
        return {
            jettonMinterAddress: slice.loadAddress(),
            jettonWalletCode: slice.loadRef(),
        };
    }

    async getGamesInfo(provider: ContractProvider): Promise<GamesInfo | null> {
        const result = await provider.get('get_games_info', []);
        const gamesInfoCell = result.stack.readCellOpt();
        if (!gamesInfoCell) {
            return null;
        }
        const slice = gamesInfoCell.beginParse();
        return {
            active_game: slice.loadAddress(),
            all_games: slice.loadRef(),
        };
    }
}

