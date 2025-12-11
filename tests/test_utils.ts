import { compile } from "@ton/blueprint";
import { Cell, toNano } from "@ton/core";
import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { Game } from "../wrappers/game/Game";
import { Ship } from "../wrappers/game/Ship";

export type ContractSystem = {
    blockchain: Blockchain;
    ownerAccount: SandboxContract<TreasuryContract>;

    game: SandboxContract<Game>;
    ownerShip: SandboxContract<Ship>; //hehe, ownership

    gameCode: Cell;
    shipCode: Cell;
    coordinateCellCode: Cell;

    messageResult: any;
}

export async function initContractSystem(): Promise<ContractSystem> {
    const blockchain = await Blockchain.create();
    const ownerAccount = await blockchain.treasury("owner");

    let gameCode = await compile('Game');
    let shipCode = await compile('Ship');
    let coordinateCellCode = await compile('CoordinateCell');

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
        messageResult,
    }
}