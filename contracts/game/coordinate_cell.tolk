import "static/messages"
import "static/storage"
import "static/helper"
import "static/errors"
import "static/structs"
import "static/constants"
import "@stdlib/gas-payments"

type AllowedMessagesToCoordinateCell = 
    | Move 
    | MoveShipToCC 
    | AnyMessage

fun onBouncedMessage(in: InMessageBounced) {

}
get fun tonBalance(): coins {
    return contract.getOriginalBalance();
}
fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToCoordinateCell.fromSlice(in.body);

    match (msg) {
        // Move => {}
        Move => {
            // debug.printString("CC01");
            var storage = lazy CoordinateCellStorage.load();
            // debug.printString("CC02");
            // var ccStorage: GameFields = GameFields.fromCell(storage.ccStorage!);
            var moveData: MoveData = lazy msg.moveData.load();
            // debug.printString("CC03");
            // val coordinatePlusMode = coordinate_plus_mode(storage.ccStorage.coordinate_x, msg.mode);
            assert (in.senderAddress == calcAddressOfCoordinateCell(storage.gameAddress, moveData.xy.x, moveData.xy.y, contract.getCode(), storage.shipCode)) throw ERR_UNAUTHORIZED;
            // debug.printString("CC04");
            val shipAddress: address = calcAddressOfShip(msg.user, storage.gameAddress, storage.shipCode, contract.getCode());
            // var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            // debug.printString("CC05");
            var firstTimeOpened = !storage.opened;
            var totalReward: coins;
            // debug.printString("CC06");
            if (firstTimeOpened && storage.ccStorage == null) {
                // and ccstorage is null
                // debug.printString("CCB01");
                var ccStorage: CCStorage = {hp: 0, jettonAmount: 0, firstExplorer: msg.user};
                random.initialize();
                val range = storage.xy.x*storage.xy.x + storage.xy.y*storage.xy.y;
                val my_random_indicator = random.range(range);
                ccStorage.hp = range;
                if (my_random_indicator > range / 2) {
                    ccStorage.jettonAmount = my_random_indicator;
                    // storage.passive_reward = my_random_indicator / 10; 
                }
                // debug.printString("CCB02");
                ccStorage.firstExplorer = msg.user;
                // ccStorage.save();
                storage.opened = true;
                storage.ccStorage = ccStorage.toCell();
                // debug.printString("CCB03");
                storage.save();
                // debug.printString("CCB04");
            }
            // debug.printString("CC07");
            var result: UniqueResult = UniqueResult.CRASH;
            var ship_hp: uint256 = 0;
            val rewardReceiver: address = msg.mode == MoveMode.EXIT ? shipAddress : msg.user;
            var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            // debug.printString("CC08");
            if (firstTimeOpened) {
                // debug.printString("CC09");
                totalReward = ccStorage.jettonAmount
            } else {
                // debug.printString("CC010");
                totalReward = ccStorage.jettonAmount / storage.xy.y;
            }
            // debug.printString("moveData.ship_hp |  ccStorage.hp");
            // debug.print<uint256>(moveData.ship_hp);
            // debug.print<uint256>(ccStorage.hp);
            if (moveData.ship_hp > ccStorage.hp && msg.mode != MoveMode.EXIT) {
                // debug.printString("CC011");
                result = UniqueResult.CONTINUE;
                ship_hp = moveData.ship_hp - ccStorage.hp;
                // rewardReceiver = shipAddress; 
                
            } else if (moveData.ship_hp > ccStorage.hp && msg.mode == MoveMode.EXIT) {
                // debug.printString("CC012");
                result = UniqueResult.SAFE_EXIT;
                // rewardReceiver = msg.user;
                ship_hp = 0;
                
            } else if (moveData.ship_hp <= ccStorage.hp) {
                // debug.printString("CC013");
                result = UniqueResult.CRASH;
                // rewardReceiver = null;
                ship_hp = 0;
                totalReward = 0;
            }

            // if (rewardReceiver!!= null && totalReward > 0 ) {
            //     val proof: address = storage.gameAddress;
            // }
            // debug.printString("CC014");
            if (totalReward > 0) {
            // if (rewardReceiver!!= null && totalReward > 0) {
            //     // val proof: ProofCell = ProofCell { mode: 0, the_adress: storage.gameAddress, data: storage.xy};
            //     // val proof: cell = beginCell().storeUint(0, 8).endCell(); 
                // val proof: address = storage.gameAddress; 
                // val proof: uint256 = 0;
                // debug.printString("CC015");
                val requestMintMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.gameAddress,
                    value: MINT_TON_AMOUNT,
                    body: RequestMint {
                        receiver: rewardReceiver,
                        amount: totalReward,
                        proof: Proof { mode: 0, data: storage.xy},
                    }
                });
                // debug.printString("CC016");
                requestMintMsg.send(0);
            }
            // debug.printString("CC017");
            // TODO
            reserveValue(in.valueCoins);
            // debug.printString("CC018");
            val moveEndMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: shipAddress,
                value: 0,
                body: MoveEnd {
                    result,
                    gameFields: GameFields {
                        xy: storage.xy,
                        hp: ship_hp,
                        jettonAmount: totalReward,
                    }
                }
            });
            // debug.printString("CC019");
            moveEndMsg.send(128);
            // debug.printString("CCCCC");
        }
        // MoveShipToCC => {}
        // else => {

        // },
        MoveShipToCC => {
            // debug.printString("A1");
            var storage = lazy CoordinateCellStorage.load();
            // debug.printString("A2");
            var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            // debug.printString("A3");
            assert (in.senderAddress == calcAddressOfShip(msg.user, storage.gameAddress, storage.shipCode, contract.getCode())) throw ERR_UNAUTHORIZED;
            // debug.printString("A4");
            reserveValue(in.valueCoins);
            // debug.printString("A5");
            val moveEndMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: calcDeployedCoordinateCell(storage.gameAddress, coordinate_plus_mode(storage.xy.x, msg.mode), storage.xy.y+1, contract.getCode(), storage.shipCode), // calculate CC
                value: 0,
                body: Move {
                    user: msg.user,
                    mode: msg.mode,
                    moveData: MoveData {
                        xy: storage.xy,
                        ship_hp: msg.ship_hp,
                    }.toCell()
                }
            });
            // debug.printString("A6");
            moveEndMsg.send(128);
            // debug.printString("A7");
        }
        ReturnExcessesBack => {}
        LiteralyAnything => {}
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
    // match (msg) {

    
    // }
}
