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
get fun get_movement_in_process(): bool {
    var storage: ShipStorage = lazy ShipStorage.load();
    return storage.movement_in_process;
}
get fun get_max_hp(): uint256 {
    var storage: ShipStorage = lazy ShipStorage.load();
    return storage.max_hp;
}
fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToShip.fromSlice(in.body);

    match (msg) {
        MoveEnd => {
            var storage: ShipStorage = lazy ShipStorage.load();
            assert (storage.gameFields != null) throw ERR_GAME_FIELDS_NOT_INITIALIZED;
            assert (storage.movement_in_process) throw ERR_MOVEMENT_NOT_IN_PROCESS;
            var gameFields: GameFields = lazy storage.gameFields!.load();
            var msgGameFields: GameFields = msg.gameFields;

            assert (in.senderAddress == calcAddressOfCoordinateCell(storage.gameAddress, msgGameFields.xy.x, msgGameFields.xy.y, storage.coordinateCellCode, contract.getCode())) throw ERR_INVALID_COORDINATE_CELL_SENDER;
            var totalReward: coins = 0;
            if (msg.result == UniqueResult.SAFE_EXIT) {
                gameFields.xy.x = 0;
                gameFields.xy.y = 0;
                gameFields.hp = storage.max_hp;
                gameFields.jettonAmount += msgGameFields.jettonAmount;
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
            storage.movement_in_process = false;
            storage.save();

            if (totalReward > 0) {
                
                
                val requestMintMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.gameAddress,
                    value: MINT_TON_AMOUNT,
                    body: RequestMint {
                        receiver: storage.userAddress,
                        amount: totalReward,
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
            // Use send_mode=128 to carry all remaining balance (excesses)
            cashbackMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        RequestToMove => {
            // Using lazy for partial update - compiler handles efficient write-back via toCell()
            var storage = lazy ShipStorage.load();
            assert (in.senderAddress == storage.userAddress) throw ERR_INVALID_USER_SENDER;
            assert (!storage.movement_in_process) throw ERR_MOVEMENT_ALREADY_IN_PROCESS;
            assert (in.valueCoins >= TODO_TOTAL_GAS_TO_MOVE) throw ERR_MESSAGE_VALUE_TOO_LOW;
            // Check we have enough balance for the operation: gas cost + coordinate cell gas
            assert (contract.getOriginalBalance() >= GAS_COST_REQUEST_TO_MOVE + GAS_COST_MOVE_SHIP_TO_CC) throw ERR_INSUFFICIENT_BALANCE_FOR_OPERATION;

            if (storage.gameFields == null) {
                val gameFields: Cell<GameFields> = beginCell().storeUint(0, 256).storeUint(0, 256).storeUint(BASIC_SHIP_HP, 256).storeCoins(0).endCell() as Cell<GameFields>;
                storage.gameFields = gameFields;
                storage.max_hp = BASIC_SHIP_HP;
                storage.movement_in_process = false;
                storage.save();
            }
            storage.movement_in_process = true;
            storage.save();
            var gameFields: GameFields = lazy storage.gameFields!.load();
            reserveValue(in.valueCoins);
            // Send enough TON for coordinate cell operations (storage + Move message)
            // Need enough for: initial storage fee (if new cell) + gas for Move + buffer
            val coordinateCellGas = GAS_COST_MOVE_SHIP_TO_CC;
            val moveMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: calcDeployedCoordinateCell(storage.gameAddress, gameFields.xy.x, gameFields.xy.y, storage.coordinateCellCode, contract.getCode()),
                value: coordinateCellGas,
                body: MoveShipToCC {
                    user: in.senderAddress,
                    mode: msg.mode,
                    ship_hp: gameFields.hp,
                }
            });
            // Use send_mode=128 to carry all remaining balance (excesses)
            moveMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        ShipUpgrade => {
            // Using lazy for partial update - compiler handles efficient write-back via toCell()
            var storage = lazy ShipStorage.load();
            // Only Game can upgrade ships
            assert (in.senderAddress == storage.gameAddress) throw ERR_INVALID_GAME_SENDER;
            assert (storage.movement_in_process == false) throw ERR_MOVEMENT_ALREADY_IN_PROCESS;


            if (storage.gameFields == null) {
                val gameFields: Cell<GameFields> = beginCell().storeUint(0, 256).storeUint(0, 256).storeUint(BASIC_SHIP_HP, 256).storeCoins(0).endCell() as Cell<GameFields>;
                storage.gameFields = gameFields;
                storage.max_hp = BASIC_SHIP_HP;
                storage.movement_in_process = false;
                storage.save();
            }
            var gameFields: GameFields = lazy storage.gameFields!.load();
            gameFields.hp += msg.hpIncrease;
            storage.max_hp += msg.hpIncrease;
            storage.gameFields = gameFields.toCell();
            storage.save();
            reserveValue(in.valueCoins);
        }
        ReturnExcessesBack => {}
        LiteralyAnything => {}
        else => {
            assert (in.body.isEmpty()) throw ERR_UNKNOWN_MESSAGE
        }
    }
}
