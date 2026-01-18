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
    | RequestToFastTravel
    | AnyMessage
    | ResetShip
    | FastTravelUpgrade

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
get fun get_max_hp(): HP_TYPE {
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
                var gameFields = buildGameFields(BASIC_SHIP_HP);
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
        RequestToFastTravel => {

            var storage = lazy ShipStorage.load();
            assert (in.senderAddress == storage.userAddress) throw ERR_INVALID_USER_SENDER;
            assert (!storage.movement_in_process) throw ERR_MOVEMENT_ALREADY_IN_PROCESS;
            assert (in.valueCoins >= TODO_TOTAL_GAS_TO_MOVE) throw ERR_MESSAGE_VALUE_TOO_LOW;
            // Check we have enough balance for the operation: gas cost + coordinate cell gas
            assert (contract.getOriginalBalance() >= GAS_COST_REQUEST_TO_MOVE + GAS_COST_MOVE_SHIP_TO_CC) throw ERR_INSUFFICIENT_BALANCE_FOR_OPERATION;

            assert (msg.xy.y > 2) throw ERR_FAST_TRAVEL_Y_TOO_LOW;
            
            if (msg.xy.x < x_zero) {
                assert (-msg.xy.x <= msg.xy.y) throw ERR_FAST_TRAVEL_NEGATIVE_X_INVALID;
            } else {
                assert (msg.xy.x <= msg.xy.y) throw ERR_FAST_TRAVEL_POSITIVE_X_INVALID;
            }
            
            assert (storage.gameFields != null) throw ERR_GAME_FIELDS_NOT_INITIALIZED;
            var gameFields: GameFields = lazy storage.gameFields!.load();

            assert (gameFields.xy.x == x_zero && gameFields.xy.y == y_zero) throw ERR_START_WRONG_XY;

            assert (storage.fastTravelInfo != null) throw ERR_FAST_TRAVEL_INFO_NOT_INITIALIZED;
            var fastTravelInfo: FastTravelInfo = lazy storage.fastTravelInfo!.load();
            
            // TODO: Calculate travel cost correctly (make it more effective than move?)
            // Note: x can be negative (already validated above), but y must be >= 0 (already validated as y > 2)
            assert (msg.xy.y >= y_zero) throw ERR_WRONG_XY;
            var travelCost = msg.xy.y * (msg.xy.y - 1) / 2 as coins;

            assert (fastTravelInfo.enrichedFuelAmount >= travelCost) throw ERR_NOT_ENOUGH_FUEL_FOR_TRAVEL;
            fastTravelInfo.enrichedFuelAmount -= travelCost;

            
            storage.fastTravelInfo = fastTravelInfo.toCell();
            storage.movement_in_process = true;
            storage.save();
            
            reserveValue(in.valueCoins);

            val xy = msg.xy;
            val moveDataCell = MoveData {
                ship_hp: gameFields.hp,
                xy: xy,
            }.toCell();


            val bodyCell = TravelToCC {
                user: in.senderAddress,
                moveData: moveDataCell,
            }.toCell();


            // The dirtiest hack you ever seen
            // It works because of the way the compiler optimizes the code
            // DO NOT REMOVE THIS HACK
            val x_z = msg.xy.x - msg.xy.x;
            val y_z = msg.xy.y - msg.xy.y;

            val calcDest = calcDeployedCoordinateCell(
                storage.gameAddress,
                (x_z),
                (y_z),
                storage.coordinateCellCode,
                contract.getCode(),
            );
            val travelMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: calcDest,
                value: 0,
                body: bodyCell,
            });
            travelMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        ShipUpgrade => {
            // Using lazy for partial update - compiler handles efficient write-back via toCell()
            var storage = lazy ShipStorage.load();
            // Only Game can upgrade ships
            assert (in.senderAddress == storage.gameAddress) throw ERR_INVALID_GAME_SENDER;
            assert (storage.movement_in_process == false) throw ERR_MOVEMENT_ALREADY_IN_PROCESS;
            assert (storage.gameFields != null) throw ERR_GAME_FIELDS_NOT_INITIALIZED;

            
            var gameFields: GameFields = lazy storage.gameFields!.load();
            gameFields.hp += msg.hpIncrease;
            storage.max_hp += msg.hpIncrease;
            storage.gameFields = gameFields.toCell();
            storage.save();
            reserveValue(in.valueCoins);
        }
        FastTravelUpgrade => {
            var storage = lazy ShipStorage.load();
            assert (in.senderAddress == storage.gameAddress) throw ERR_INVALID_USER_SENDER;
            assert (storage.movement_in_process == false) throw ERR_MOVEMENT_ALREADY_IN_PROCESS;
            assert (storage.gameFields != null) throw ERR_GAME_FIELDS_NOT_INITIALIZED;

            if (storage.fastTravelInfo == null) {
                var fastTravelInfo = FastTravelInfo {
                    enrichedFuelAmount: msg.jettonAmount,
                };
                storage.fastTravelInfo = fastTravelInfo.toCell();
            } else {
                var fastTravelInfo: FastTravelInfo = lazy storage.fastTravelInfo!.load();
                fastTravelInfo.enrichedFuelAmount += msg.jettonAmount;
                storage.fastTravelInfo = fastTravelInfo.toCell();
            }
            storage.save();

        },
        ResetShip => {
            var storage = lazy ShipStorage.load();
            assert (in.senderAddress == storage.userAddress) throw ERR_INVALID_USER_SENDER;
            assert (in.valueCoins >= GAS_COST_RESET_SHIP) throw ERR_MESSAGE_VALUE_TOO_LOW;
            var gameFields = buildGameFields(BASIC_SHIP_HP);
            var fastTravelInfo = FastTravelInfo {
                enrichedFuelAmount: 0,
            };

            // storage.gameFields = gameFields.toCell();
            storage.fastTravelInfo = fastTravelInfo.toCell();
            storage.movement_in_process = false;
            storage.save();
        },
        ReturnExcessesBack => {}
        LiteralyAnything => {}
        else => {
            assert (in.body.isEmpty()) throw ERR_UNKNOWN_MESSAGE
        }
    }
}
