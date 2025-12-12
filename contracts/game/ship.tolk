import "static/messages"
import "static/storage"
import "static/helper"
import "static/errors"
import "static/structs"
import "static/constants"

type AllowedMessagesToShip = 
    | MoveEnd 
    | RequestToMove 
    | ShipUpgrade
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
                gameFields.xy.x = 0;
                gameFields.xy.y = 0;
                gameFields.hp = storage.max_hp;
                totalReward = gameFields.jettonAmount;
                gameFields.jettonAmount = 0;
            }

            if (msg.result == UniqueResult.CRASH) {
                gameFields.xy.x = 0;
                gameFields.xy.y = 0;
                gameFields.hp = storage.max_hp;
                totalReward = gameFields.jettonAmount / 10;
                gameFields.jettonAmount = 0;
            }
            
            if (msg.result == UniqueResult.CONTINUE) {
                gameFields.xy.x = msgGameFields.xy.x;
                gameFields.xy.y = msgGameFields.xy.y;
                gameFields.hp = msgGameFields.hp;
                gameFields.jettonAmount += msgGameFields.jettonAmount;
            }
            storage.gameFields = gameFields.toCell();
            storage.save();

            if (totalReward > 0) {
                
                
                val requestMintMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.gameAddress,
                    value: MINT_TON_AMOUNT,
                    body: RequestMint {
                        receiver: storage.userAddress,
                        amount: totalReward,
                        ship: contract.getAddress(),
                    }
                });
                requestMintMsg.send(0);
            }
            reserveValue(in.valueCoins);
            val cashbackMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: storage.userAddress,
                value: 0,
                body: ReturnExcessesBack {queryId:0},
            });
            cashbackMsg.send(128);
        }
        RequestToMove => {
            var storage = ShipStorage.load();
            assert (in.senderAddress == storage.userAddress) throw ERR_UNAUTHORIZED;
            assert (contract.getOriginalBalance() > ton("1")) throw 5;

            if (storage.gameFields == null) {
                val gameFields: Cell<GameFields> = beginCell().storeUint(0, 256).storeUint(0, 256).storeUint(BASIC_SHIP_HP, 256).storeCoins(0).endCell() as Cell<GameFields>;
                storage.gameFields = gameFields;
                storage.save();
            }
            var gameFields: GameFields = lazy storage.gameFields!.load();
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
            moveMsg.send(128);
        }
        ShipUpgrade => {
            var storage = ShipStorage.load();
            // Only Game can upgrade ships
            assert (in.senderAddress == storage.gameAddress) throw ERR_UNAUTHORIZED;
            
            if (storage.gameFields == null) {
                val gameFields: Cell<GameFields> = beginCell().storeUint(0, 256).storeUint(0, 256).storeUint(BASIC_SHIP_HP, 256).storeCoins(0).endCell() as Cell<GameFields>;
                storage.gameFields = gameFields;
                storage.save();
            }
            var gameFields: GameFields = lazy storage.gameFields!.load();
            gameFields.hp += msg.hpIncrease;
            storage.gameFields = gameFields.toCell();
            storage.save();
            reserveValue(in.valueCoins);
        }
        ReturnExcessesBack => {}
        LiteralyAnything => {}
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}
