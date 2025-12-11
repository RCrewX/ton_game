import { compile } from "@ton/blueprint";
import { Cell, toNano } from "@ton/core";
import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { Game } from "../wrappers/game/Game";
import { Ship } from "../wrappers/game/Ship";
import { CoordinateCell } from "../wrappers/game/CoordinateCell";
import { MoveMode } from "../wrappers/game/structs";

export type ContractSystem = {
    blockchain: Blockchain;
    ownerAccount: SandboxContract<TreasuryContract>;

    game: SandboxContract<Game>;
    ownerShip: SandboxContract<Ship>; //hehe, ownership

    gameCode: Cell;
    shipCode: Cell;
    coordinateCellCode: Cell;
    jettonWalletCode: Cell;
    jettonMinterCode: Cell;

    messageResult: any;
}

export async function initContractSystem(): Promise<ContractSystem> {
    const blockchain = await Blockchain.create();
    const ownerAccount = await blockchain.treasury("owner");

    let gameCode = await compile('Game');
    let shipCode = await compile('Ship');
    let coordinateCellCode = await compile('CoordinateCell');
    let jettonWalletCode = await compile('JettonWallet');
    let jettonMinterCode = await compile('JettonMinter');

    let game = blockchain.openContract(Game.createFromConfig({ 
        managerAddress: ownerAccount.address,
        shipCode,
        coordinateCellCode,
    }, gameCode));

    let ownerShip = blockchain.openContract(Ship.createFromConfig({
        userAddress: ownerAccount.address,
        gameAddress: game.address,
        coordinateCellCode,
    }, shipCode))
    
    let messageResult = await game.sendDeploy(ownerAccount.getSender(), toNano('0.5'));

    expect(messageResult.transactions).toHaveTransaction({
        from: ownerAccount.address,
        to: game.address,
        deploy: true,
        success: true,
    });

    messageResult = await ownerShip.sendDeploy(ownerAccount.getSender(), toNano('0.5'));

    expect(messageResult.transactions).toHaveTransaction({
        from: ownerAccount.address,
        to: ownerShip.address,
        deploy: true,
        success: true,
    });

    return {
        blockchain,
        ownerAccount,
        game,
        ownerShip,
        gameCode,
        shipCode,
        coordinateCellCode,
        jettonMinterCode,
        jettonWalletCode,
        messageResult,
    }
}

export async function setupCoordinateCellWithFirstExplorer(
    SC_System: ContractSystem,
    xy: { x: bigint; y: bigint }
): Promise<SandboxContract<CoordinateCell>> {
    // Create a ship for the first explorer
    const firstExplorerShip = SC_System.blockchain.openContract(Ship.createFromConfig({
        userAddress: SC_System.ownerAccount.address,
        gameAddress: SC_System.game.address,
        coordinateCellCode: SC_System.coordinateCellCode,
    }, SC_System.shipCode));

    await firstExplorerShip.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.5'));

    // Create the CoordinateCell
    const coordinateCell = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({
        gameAddress: SC_System.game.address,
        xy,
        shipCode: SC_System.shipCode,
    }, SC_System.coordinateCellCode));

    // Deploy the CoordinateCell
    await coordinateCell.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.05'));

    // Open the cell by moving to it (this sets firstExplorer)
    SC_System.messageResult = await firstExplorerShip.sendMove(
        SC_System.ownerAccount.getSender(),
        toNano('2'),
        MoveMode.UP
    );

    return coordinateCell;
}