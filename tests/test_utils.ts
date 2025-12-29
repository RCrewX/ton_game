import { compile } from "@ton/blueprint";
import { Address, beginCell, Cell, toNano } from "@ton/core";
import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { Game } from "../wrappers/game/Game";
import { Ship } from "../wrappers/game/Ship";
import { CoordinateCell } from "../wrappers/game/CoordinateCell";
import { GameManager } from "../wrappers/game_manager/GameManager";
import { MoveMode } from "../wrappers/game/structs";
import { jettonContentToCell, JettonMinter } from "../wrappers/jetton/JettonMinter";
import { JettonWallet } from "../wrappers/jetton/JettonWallet";
import { Opcodes, GAS_COST_SET_JETTON_MINTER_ADDRESS, GAS_COST_SET_GAMES, GAS_COST_REDIRECT_MESSAGE } from "../wrappers/game_manager/types";
import { GAS_COST_REQUEST_TO_MOVE, GAS_COST_MOVE_SHIP_TO_CC, GAS_COST_REQUEST_MINT, BASIC_STORAGE_TAX, JettonUsageMode, GAS_COST_SEND_MOVE, Opcodes as GameOpcodes } from "../wrappers/game/types";

export type ContractSystem = {
    blockchain: Blockchain;
    ownerAccount: SandboxContract<TreasuryContract>;

    gameManager: SandboxContract<GameManager>;
    game: SandboxContract<Game>;
    ownerShip: SandboxContract<Ship>; //hehe, ownership
    jettonMinter: SandboxContract<JettonMinter>;

    ownerJettonWallet: SandboxContract<JettonWallet>;
    gameManagerCode: Cell;
    gameCode: Cell;
    shipCode: Cell;
    coordinateCellCode: Cell;
    jettonWalletCode: Cell;
    jettonMinterCode: Cell;
    subcontractCode: Cell;

    messageResult: any;
}

export async function initContractSystem(): Promise<ContractSystem> {
    const blockchain = await Blockchain.create();
    const ownerAccount = await blockchain.treasury("owner");

    let gameManagerCode = await compile('GameManager');
    let gameCode = await compile('Game');
    let shipCode = await compile('Ship');
    let coordinateCellCode = await compile('CoordinateCell');
    let jettonWalletCode = await compile('JettonWallet');
    let jettonMinterCode = await compile('JettonMinter');
    let subcontractCode = await compile('Subcontract');

    // Deploy GameManager first
    let gameManager = blockchain.openContract(GameManager.createFromConfig({
        ownerAddress: ownerAccount.address,
    }, gameManagerCode));

    let messageResult = await gameManager.sendDeploy(ownerAccount.getSender(), toNano('0.5'));

    expect(messageResult.transactions).toHaveTransaction({
        from: ownerAccount.address,
        to: gameManager.address,
        deploy: true,
        success: true,
    });

    // Deploy Game with GameManager as manager
    let game = blockchain.openContract(Game.createFromConfig({ 
        managerAddress: gameManager.address,
        shipCode,
        coordinateCellCode,
    }, gameCode));

    messageResult = await game.sendDeploy(ownerAccount.getSender(), toNano('0.5'));

    expect(messageResult.transactions).toHaveTransaction({
        from: ownerAccount.address,
        to: game.address,
        deploy: true,
        success: true,
    });

    // Deploy JettonMinter
    let jettonMinter = blockchain.openContract(JettonMinter.createFromConfig({
        admin: gameManager.address,
        content: jettonContentToCell({ type: 1, uri: 'https://example.com/jetton.json' }),
        wallet_code: jettonWalletCode,
    }, jettonMinterCode));

    messageResult = await jettonMinter.sendDeploy(ownerAccount.getSender(), toNano('0.5'));
    expect(messageResult.transactions).toHaveTransaction({
        from: ownerAccount.address,
        to: jettonMinter.address,
        deploy: true,
        success: true,
    });
    let ownerJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
        ownerAddress: ownerAccount.address,
        minterAddress: jettonMinter.address,
    }, jettonWalletCode));
    messageResult = await ownerJettonWallet.sendDeploy(ownerAccount.getSender(), toNano('0.5'));
    expect(messageResult.transactions).toHaveTransaction({
        from: ownerAccount.address,
        to: ownerJettonWallet.address,
        deploy: true,
        success: true,
    });

    // Set jetton minter address in GameManager
    messageResult = await gameManager.sendSetJettonMinterAddress(ownerAccount.getSender(), GAS_COST_SET_JETTON_MINTER_ADDRESS, jettonMinter.address, jettonWalletCode);
    expect(messageResult.transactions).toHaveTransaction({
        from: ownerAccount.address,
        to: gameManager.address,
        success: true,
    });

    // Set game address in game manager
    messageResult = await gameManager.sendSetGames(ownerAccount.getSender(), GAS_COST_SET_GAMES, beginCell().storeAddress(game.address).endCell());
    expect(messageResult.transactions).toHaveTransaction({
        from: ownerAccount.address,
        to: gameManager.address,
        success: true,
    });

    // Check game manager address in minter
    let minterOwnerAddress = await jettonMinter.getAdminAddress();
    expect(minterOwnerAddress).toEqualAddress(gameManager.address);

    // Check jetton minter address in game manager
    let jettonMinterAddress = await gameManager.getJettonMinterAddress();
    expect(jettonMinterAddress).toEqualAddress(jettonMinter.address);

    // Check game address in game manager
    let games = await gameManager.getGames();
    let gameAddress = games?.beginParse().loadAddress();
    expect(gameAddress).toEqualAddress(game.address);

    // Mint jettons thru redirecting mint message to game manager to user first (so they can transfer)
    const mintAmount = toNano('1000');
    const forwardAmount = toNano('0.1');
    const redirectMessage = JettonMinter.mintMessage(jettonMinter.address, ownerAccount.address, mintAmount, toNano('0.1'), toNano('0.2'));
    // Need to send gas cost + forward amount for redirect message
    messageResult = await gameManager.sendRedirectMessage(
        ownerAccount.getSender(),
        GAS_COST_REDIRECT_MESSAGE + forwardAmount,
        jettonMinter.address,
        redirectMessage,
        forwardAmount
    );
    expect(messageResult.transactions).toHaveTransaction({
        from: ownerAccount.address,
        to: gameManager.address,
        success: true,
    });
    expect(messageResult.transactions).toHaveTransaction({
        from: gameManager.address,
        to: jettonMinter.address,
        success: true,
    });
    expect(messageResult.transactions).toHaveTransaction({
        from: jettonMinter.address,
        to: ownerJettonWallet.address,
        success: true,
    });

    const userBalance = await ownerJettonWallet.getJettonBalance();
    expect(userBalance).toBe(mintAmount);
    // Deploy Ship
    let ownerShip = blockchain.openContract(Ship.createFromConfig({
        userAddress: ownerAccount.address,
        gameAddress: game.address,
        coordinateCellCode,
    }, shipCode))
    
    messageResult = await ownerShip.sendDeploy(ownerAccount.getSender(), toNano('5'));

    expect(messageResult.transactions).toHaveTransaction({
        from: ownerAccount.address,
        to: ownerShip.address,
        deploy: true,
        success: true,
    });

    // move EXIT from (0, 1)
    messageResult = await ownerShip.sendMove(ownerAccount.getSender(), GAS_COST_SEND_MOVE, MoveMode.EXIT);
    expect(messageResult.transactions).toHaveTransaction({
        to: ownerShip.address,
        success: true,
        op: GameOpcodes.OP_MOVE_END,
    });
    expect(await ownerShip.getMovementInProcess()).toBe(false);


    return {
        blockchain,
        ownerAccount,
        gameManager,
        game,
        ownerShip,
        jettonMinter,
        ownerJettonWallet,
        gameManagerCode,
        gameCode,
        shipCode,
        coordinateCellCode,
        jettonMinterCode,
        jettonWalletCode,
        subcontractCode,
        messageResult,
    }
}

export async function setupCoordinateCellWithFirstExplorer(
    SC_System: ContractSystem,
    xy: { x: bigint; y: bigint }
): Promise<{ coordinateCell: SandboxContract<CoordinateCell>; firstExplorerShip: SandboxContract<Ship> }> {
    // Create a ship for the first explorer
    const firstExplorerShip = SC_System.blockchain.openContract(Ship.createFromConfig({
        userAddress: SC_System.ownerAccount.address,
        gameAddress: SC_System.game.address,
        coordinateCellCode: SC_System.coordinateCellCode,
    }, SC_System.shipCode));

    await firstExplorerShip.sendDeploy(SC_System.ownerAccount.getSender(), toNano('5'));

    // Ensure ship has enough balance for the move
    const minRequiredBalance = GAS_COST_REQUEST_TO_MOVE + GAS_COST_MOVE_SHIP_TO_CC + toNano('0.1');
    const currentBalance = await firstExplorerShip.getTonBalance();
    if (currentBalance < minRequiredBalance) {
        await SC_System.ownerAccount.send({
            to: firstExplorerShip.address,
            value: minRequiredBalance - currentBalance + toNano('0.1'),
            body: beginCell().endCell(),
        });
    }

    // Create the CoordinateCell
    const coordinateCell = SC_System.blockchain.openContract(CoordinateCell.createFromConfig({
        gameAddress: SC_System.game.address,
        xy,
        shipCode: SC_System.shipCode,
    }, SC_System.coordinateCellCode));

    // Deploy the CoordinateCell
    await coordinateCell.sendDeploy(SC_System.ownerAccount.getSender(), toNano('0.05'));

    // Open the cell by moving to it (this sets firstExplorer)
    // Ship requires TODO_TOTAL_GAS_TO_MOVE = GAS_COST_REQUEST_TO_MOVE + GAS_COST_REQUEST_MINT + BASIC_STORAGE_TAX
    const TODO_TOTAL_GAS_TO_MOVE = GAS_COST_REQUEST_TO_MOVE + GAS_COST_REQUEST_MINT + BASIC_STORAGE_TAX;
    SC_System.messageResult = await firstExplorerShip.sendMove(
        SC_System.ownerAccount.getSender(),
        TODO_TOTAL_GAS_TO_MOVE,
        MoveMode.UP
    );

    return { coordinateCell, firstExplorerShip };
}

export function buildJettonUsageForwardPayload(gameAddress: Address, shipAddress: Address, usageMode: JettonUsageMode) {
    const dataCell = beginCell()
        .storeUint(usageMode, 8)
        .storeAddress(shipAddress)
        .endCell();
    const gameAddressCell = beginCell()
        .storeAddress(gameAddress)
        .endCell();
    return beginCell()
        .storeRef(gameAddressCell)
        .storeRef(dataCell)
        .endCell();
}

/**
 * Cleanup function to help with memory management
 * Clears references and forces garbage collection hints
 * 
 * Memory safety considerations:
 * - Transaction arrays can be large (hundreds of transactions)
 * - Contract instances hold references to blockchain
 * - Compiled code cells are relatively small but should be cleared
 * - Treasury accounts hold references to blockchain
 */
export function cleanupContractSystem(system: ContractSystem | null | undefined) {
    if (!system) return;
    
    // Clear message result first - transaction arrays can be very large
    // Each transaction contains full message data, state, etc.
    system.messageResult = null;
    
    // Clear contract references - these hold references to blockchain
    // Note: We can't null these in the type system, but clearing messageResult
    // helps break the reference chain
    
    // Clear compiled code cells - these are relatively small but accumulate
    // Note: These are Cell objects which are immutable, so clearing references helps
    
    // Force garbage collection if available (Node.js with --expose-gc flag)
    // This helps free memory immediately rather than waiting for next GC cycle
    if (global.gc) {
        global.gc();
    }
}