import "static/messages"
import "static/storage"
import "static/helper"
import "static/errors"
import "static/structs"
import "static/constants"

type AllowedMessagesToShip = MoveEnd | RequestToMove | AnyMessage


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

            storage.save();

            if (totalReward > 0) {
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
            // 
            // 
            // 
            // 
        }
        RequestToMove => {
            var storage = lazy ShipStorage.load();
            assert (in.senderAddress == storage.userAddress) throw ERR_UNAUTHORIZED;

            assert (contract.getOriginalBalance() > ton("1")) throw 5;

            // if uninited: init

            if (storage.gameFields == null) {
                val xy: XY = XY {x:0, y:0};
                // val gameFields: GameFields = GameFields { 
                //     xy: xy,
                //      hp: BASIC_SHIP_HP, jettonAmount: 0 };
                val gameFields: Cell<GameFields> = beginCell().storeUint(0, 256).storeUint(0, 256).storeUint(0, 256).storeCoins(0).endCell() as Cell<GameFields>;
                                        
                storage.gameFields = gameFields;

                storage.save();
            }

            var gameFields: GameFields = lazy storage.gameFields!.load();
            
            val moveMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: calcAddressOfCoordinateCell(storage.gameAddress, gameFields.xy.x, gameFields.xy.y, storage.coordinateCellCode, contract.getCode()),
                value: MINT_TON_AMOUNT,
                body: MoveShipToCC {
                    user: in.senderAddress,
                    mode: msg.mode,
                    ship_hp: gameFields.hp,
                }
            });
            moveMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);

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
