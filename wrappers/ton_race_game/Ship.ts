import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { encodeRequestToMove, encodeRequestToFastTravel, encodeRequestToHardTravel, encodeRequestShipToMint, loadGameFieldsOpt } from './types';
import { MoveMode, XY, HP_TYPE_BITS, HardTravelInfo } from './structs';
import { Coins, loadCoins } from '@ton/sandbox/dist/config/config.tlb-gen';

export type ShipConfig = {
    userAddress: Address,
    gameAddress: Address,
    coordinateCellCode: Cell,
};

export function shipConfigToCell(config: ShipConfig): Cell {
    return beginCell()
        .storeAddress(config.userAddress)
        .storeAddress(config.gameAddress)
        .storeUint(0, HP_TYPE_BITS) // max_hp: 0 (will be set when gameFields are initialized)
        .storeMaybeRef(null) // gameFields: null
        .storeMaybeRef(null) // fastTravelInfo: null
        .storeRef(config.coordinateCellCode)
        .storeBit(false) // movement_in_process: false
        .storeCoins(0) // pending_mint_amount: 0
        .endCell();
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

    async sendMove(provider: ContractProvider, via: Sender, value: bigint, move: MoveMode) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeRequestToMove({ mode: move }),
        });
    }

    async sendFastTravel(provider: ContractProvider, via: Sender, value: bigint, xy: XY) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeRequestToFastTravel({ xy }),
        });
    }

    async sendHardTravel(provider: ContractProvider, via: Sender, value: bigint, info: HardTravelInfo) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeRequestToHardTravel({ info }),
        });
    }

    async getCurrentGameData(provider: ContractProvider) {
        const result = await provider.get('currentGameData', []);
        return loadGameFieldsOpt(result.stack);
    }

    async getTonBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('tonBalance', []);
        return result.stack.readBigNumber();
    }

    async getMovementInProcess(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_movement_in_process', []);
        return result.stack.readBoolean();
    }

    async getMaxHp(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_max_hp', []);
        return result.stack.readBigNumber();
    }

    async getPendingMintAmount(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_pending_mint_amount', []);
        return result.stack.readBigNumber();
    }

    async sendRequestShipToMint(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeRequestShipToMint(),
        });
    }
}
