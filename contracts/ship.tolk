import "static/messages"
import "static/storage"
import "static/helper"
import "static/errors"
import "static/structs"
import "static/constants"

type AllowedMessagesToShip = 
    | MoveEnd 
    | RequestToMove 
    | AnyMessage

get fun currentGameData(): GameFields? {
    var storage: ShipStorage = lazy ShipStorage.load();
    if (storage.gameFields == null) {
        return null;
    }
    var gameFields: GameFields = lazy storage.gameFields!.load();
    return gameFields;
}
get fun tonBalance(): coins {
    return contract.getOriginalBalance();
}
fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToShip.fromSlice(in.body);

    match (msg) {
        MoveEnd => {
            var storage: ShipStorage = lazy ShipStorage.load();
            var gameFields: GameFields = lazy storage.gameFields!.load();
            var msgGameFields: GameFields = msg.gameFields;

            assert (in.senderAddress == calcAddressOfCoordinateCell(storage.gameAddress, msgGameFields.xy.x, msgGameFields.xy.y, storage.coordinateCellCode, contract.getCode())) throw ERR_UNAUTHORIZED;
            var totalReward: coins = 0;
            if (msg.result == UniqueResult.SAFE_EXIT) {
                // debug.printString("SAFE_EXIT");
                gameFields.xy.x = 0;
                gameFields.xy.y = 0;
                gameFields.hp = storage.max_hp;
                totalReward = gameFields.jettonAmount;
                gameFields.jettonAmount = 0;
            }

            if (msg.result == UniqueResult.CRASH) {
                // debug.printString("CRASH");
                gameFields.xy.x = 0;
                gameFields.xy.y = 0;
                gameFields.hp = storage.max_hp;
                totalReward = gameFields.jettonAmount / 10;
                gameFields.jettonAmount = 0;
            }
            
            if (msg.result == UniqueResult.CONTINUE) {
                // debug.printString("CONTINUE");
                gameFields.xy.x = msgGameFields.xy.x;
                gameFields.xy.y = msgGameFields.xy.y;
                // debug.print<uint256>(msgGameFields.hp);
                gameFields.hp = msgGameFields.hp;
                // debug.print<uint256>(gameFields.hp);
                gameFields.jettonAmount += msgGameFields.jettonAmount;
            }
            storage.gameFields = gameFields.toCell();
            storage.save();

            // debug.printString("save");
            if (totalReward > 0) {
                // debug.printString("totalReward>0");
                var MINT_TON_AMOUNT: coins = ton("0.1");

                
                val requestMintMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.gameAddress,
                    value: MINT_TON_AMOUNT,
                    body: RequestMint {
                        receiver: storage.userAddress,
                        amount: totalReward,
                        proof: Proof { mode: 1, data: contract.getAddress()},
                    }
                });
                requestMintMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
            }
            reserveValue(in.valueCoins);
            val cashbackMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: storage.userAddress,
                value: 0,
                body: ReturnExcessesBack {queryId:0},
            });
            cashbackMsg.send(128);         
            // 
            // 
            // 
            // 
        }
        RequestToMove => {
            // debug.printString("03");
            var storage = ShipStorage.load();
            // debug.printString("02");
            assert (in.senderAddress == storage.userAddress) throw ERR_UNAUTHORIZED;
            // debug.printString("01");
            assert (contract.getOriginalBalance() > ton("1")) throw 5;
            // debug.printString("00");
            // if uninited: init

            if (storage.gameFields == null) {
                // debug.printString("A1");

                val xy: XY = XY {x:0, y:0};
                // val gameFields: GameFields = GameFields { 
                // xy: xy,
                // hp: BASIC_SHIP_HP, jettonAmount: 0 };
                // debug.printString("A2");
                val gameFields: Cell<GameFields> = beginCell().storeUint(0, 256).storeUint(0, 256).storeUint(BASIC_SHIP_HP, 256).storeCoins(0).endCell() as Cell<GameFields>;
                // debug.printString("A3");                                
                storage.gameFields = gameFields;
                // debug.printString("A4");
                storage.save();
                // debug.printString("A5");
            }
            // debug.printString("B1");
            var gameFields: GameFields = lazy storage.gameFields!.load();
            // debug.printString("B2");
            reserveValue(in.valueCoins);
            val moveMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: calcDeployedCoordinateCell(storage.gameAddress, gameFields.xy.x, gameFields.xy.y, storage.coordinateCellCode, contract.getCode()),
                value: 0,
                body: MoveShipToCC {
                    user: in.senderAddress,
                    mode: msg.mode,
                    ship_hp: gameFields.hp,
                }
            });
            // debug.printString("B3");
            moveMsg.send(128);
            // debug.printString("B4");
            // 
            // 
            // 
            // 
            // 

            // send(MoveShipToCC);
        }
        ReturnExcessesBack => {}
        LiteralyAnything => {}
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}
