import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { XY, MoveMode, MoveData, storeMoveData } from './structs';
import { encodeMove, encodeMoveShipToCC } from './types';

export type CoordinateCellConfig = {
    gameAddress: Address,
    xy: XY,
    shipCode: Cell,
};

export function coordinateCellConfigToCell(config: CoordinateCellConfig): Cell {
    return beginCell().storeAddress(config.gameAddress).storeInt(config.xy.x, 256).storeUint(config.xy.y, 256).storeBit(false).storeMaybeRef(null).storeRef(config.shipCode).endCell();
}

export class CoordinateCell implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new CoordinateCell(address);
    }

    static createFromConfig(config: CoordinateCellConfig, code: Cell, workchain = 0) {
        const data = coordinateCellConfigToCell(config);
        const init = { code, data };
        return new CoordinateCell(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMove(provider: ContractProvider, via: Sender, value: bigint, user: Address, mode: MoveMode, moveData: MoveData) {
        const moveDataCell = beginCell();
        storeMoveData(moveDataCell, moveData);
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeMove({ user, mode, moveData: moveDataCell.endCell() }),
        });
    }

    async sendMoveShipToCC(provider: ContractProvider, via: Sender, value: bigint, user: Address, ship_hp: bigint, mode: MoveMode) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: encodeMoveShipToCC({ user, ship_hp, mode }),
        });
    }

    async getTonBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('tonBalance', []);
        return result.stack.readBigNumber();
    }
}
