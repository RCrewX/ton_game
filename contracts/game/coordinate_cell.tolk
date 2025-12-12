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
    | WithdrawTON
    | WithdrawJetton
    | AnyMessage

fun onBouncedMessage(in: InMessageBounced) {

}
get fun tonBalance(): coins {
    return contract.getOriginalBalance();
}
fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToCoordinateCell.fromSlice(in.body);

    match (msg) {
        Move => {
            var storage = lazy CoordinateCellStorage.load();
            var moveData: MoveData = lazy msg.moveData.load();
            assert (in.senderAddress == calcAddressOfCoordinateCell(storage.gameAddress, moveData.xy.x, moveData.xy.y, contract.getCode(), storage.shipCode)) throw ERR_UNAUTHORIZED;
            val shipAddress: address = calcAddressOfShip(msg.user, storage.gameAddress, storage.shipCode, contract.getCode());
            var firstTimeOpened = !storage.opened;
            var totalReward: coins;
            if (firstTimeOpened && storage.ccStorage == null) {
                var ccStorage: CCStorage = {hp: 0, jettonAmount: 0, firstExplorer: msg.user};
                random.initialize();
                val range = storage.xy.y;
                val my_random_indicator = random.range(range);
                ccStorage.hp = my_random_indicator;
                ccStorage.jettonAmount = my_random_indicator as coins;
                
                ccStorage.firstExplorer = msg.user;
                storage.opened = true;
                storage.ccStorage = ccStorage.toCell();
                storage.save();
            }
            var result: UniqueResult = UniqueResult.CRASH;
            var ship_hp: uint256 = 0;
            val rewardReceiver: address = msg.mode == MoveMode.EXIT ? shipAddress : msg.user;
            var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            if (firstTimeOpened) {
                totalReward = ccStorage.jettonAmount
            } else {
                totalReward = ccStorage.jettonAmount / storage.xy.y;
            }
            if (moveData.ship_hp > ccStorage.hp && msg.mode != MoveMode.EXIT) {
                result = UniqueResult.CONTINUE;
                ship_hp = moveData.ship_hp - ccStorage.hp;
            } else if (moveData.ship_hp > ccStorage.hp && msg.mode == MoveMode.EXIT) {
                result = UniqueResult.SAFE_EXIT;
                ship_hp = 0;
            } else if (moveData.ship_hp <= ccStorage.hp) {
                result = UniqueResult.CRASH;
                ship_hp = 0;
                totalReward = 0;
            }

            // if (totalReward > 0) {
            //     val requestMintMsg = createMessage({
            //         bounce: BounceMode.NoBounce,
            //         dest: storage.gameAddress,
            //         value: MINT_TON_AMOUNT,
            //         body: RequestMint {
            //             receiver: rewardReceiver,
            //             amount: totalReward,
            //         }
            //     });
            //     requestMintMsg.send(0);
            // }
            reserveValue(in.valueCoins);
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
            moveEndMsg.send(128);
        }
        MoveShipToCC => {
            var storage = lazy CoordinateCellStorage.load();
            var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            assert (in.senderAddress == calcAddressOfShip(msg.user, storage.gameAddress, storage.shipCode, contract.getCode())) throw ERR_UNAUTHORIZED;
            reserveValue(in.valueCoins);
            val moveEndMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: calcDeployedCoordinateCell(storage.gameAddress, coordinate_plus_mode(storage.xy.x, msg.mode), storage.xy.y+1, contract.getCode(), storage.shipCode),
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
            moveEndMsg.send(128);
        }
        WithdrawTON => {
            var storage = lazy CoordinateCellStorage.load();
            assert (storage.ccStorage != null) throw ERR_UNAUTHORIZED;
            var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            assert (ccStorage.firstExplorer != null) throw ERR_UNAUTHORIZED;
            assert (in.senderAddress == ccStorage.firstExplorer!) throw ERR_UNAUTHORIZED;
            
            val currentBalance = contract.getOriginalBalance();
            val minRequiredBalance = BASIC_STORAGE_TAX;
            assert (currentBalance - in.valueCoins >= minRequiredBalance + msg.amount) throw ERR_NOT_ENOUGH_BALANCE;
            
            val withdrawMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.recipient,
                value: msg.amount,
                body: ReturnExcessesBack {
                    queryId: msg.queryId
                }
            });
            withdrawMsg.send(0);
        }
        WithdrawJetton => {
            var storage = lazy CoordinateCellStorage.load();
            assert (storage.ccStorage != null) throw ERR_UNAUTHORIZED;
            var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            assert (ccStorage.firstExplorer != null) throw ERR_UNAUTHORIZED;
            assert (in.senderAddress == ccStorage.firstExplorer!) throw ERR_UNAUTHORIZED;
            
            // Send AskToTransfer to CoordinateCell's jetton wallet
            // The wallet will transfer jettons to the recipient
            val coordinateCellAddress = contract.getAddress();
            val forwardPayload = beginCell().storeUint(1, 128).toSlice();
            reserveValue(in.valueCoins);
            val askToTransferMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: msg.jettonWalletAddress,
                value: msg.forwardTonAmount + ton("0.05"), // forward amount + gas for wallet operations
                body: AskToTransfer {
                    queryId: msg.queryId,
                    jettonAmount: msg.amount,
                    transferRecipient: msg.recipient,
                    sendExcessesTo: in.senderAddress,
                    customPayload: null,
                    forwardTonAmount: msg.forwardTonAmount,
                    forwardPayload: forwardPayload
                }
            });
            askToTransferMsg.send(128);
        }
        ReturnExcessesBack => {}
        LiteralyAnything => {}
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}
