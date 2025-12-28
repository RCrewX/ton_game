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
    | WithdrawNFT
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
            assert (in.senderAddress == calcAddressOfCoordinateCell(storage.gameAddress, moveData.xy.x, moveData.xy.y, contract.getCode(), storage.shipCode)) throw ERR_INVALID_COORDINATE_CELL_SENDER_FOR_MOVE;
            val shipAddress: address = calcAddressOfShip(msg.user, storage.gameAddress, storage.shipCode, contract.getCode());
            var firstTimeOpened = !storage.opened;
            var totalReward: coins;
            if (firstTimeOpened && storage.ccStorage == null) {
                var ccStorage: CCStorage = {hp: 0, jettonAmount: 0, firstExplorer: msg.user};


                val randomResult: RandomResult = generateRandomResult(storage.xy.y);
                
                ccStorage.hp = randomResult.hp;
                ccStorage.jettonAmount = randomResult.jettonAmount;

                ccStorage.firstExplorer = msg.user;
                storage.opened = true;
                storage.ccStorage = ccStorage.toCell();
                storage.save();
            }
            var result: UniqueResult = UniqueResult.CRASH;
            var ship_hp: HP_TYPE = 0;
            assert (storage.ccStorage != null) throw ERR_COORDINATE_CELL_STORAGE_NOT_INITIALIZED;
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


            
            // For new cells, don't reserve at all - just leave enough for MoveEnd
            // For existing cells, use normal reserve
            // TODO: why?
            if (!firstTimeOpened) {
                reserveValue(in.valueCoins);
            }
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
            // Use send_mode=128 to carry all remaining balance (excesses)
            moveEndMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        MoveShipToCC => {
            var storage = lazy CoordinateCellStorage.load();
            var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            assert (in.senderAddress == calcAddressOfShip(msg.user, storage.gameAddress, storage.shipCode, contract.getCode())) throw ERR_INVALID_SHIP_SENDER_FOR_MOVE;
            reserveValue(in.valueCoins);
            // Forward enough TON to the new coordinate cell so it can send MoveEnd back
            // Need enough for: initial storage fee (if new cell) + gas for Move + buffer
            val coordinateCellGas = GAS_COST_MOVE;
            val moveEndMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: calcDeployedCoordinateCell(storage.gameAddress, coordinate_plus_mode(storage.xy.x, msg.mode), storage.xy.y+1, contract.getCode(), storage.shipCode),
                value: coordinateCellGas,
                body: Move {
                    user: msg.user,
                    mode: msg.mode,
                    moveData: MoveData {
                        xy: storage.xy,
                        ship_hp: msg.ship_hp,
                    }.toCell()
                }
            });
            // Use send_mode=128 to carry all remaining balance (excesses)
            moveEndMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        WithdrawTON => {
            
            var storage = lazy CoordinateCellStorage.load();
            assert (storage.ccStorage != null) throw ERR_COORDINATE_CELL_STORAGE_NOT_INITIALIZED;
            var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            assert (ccStorage.firstExplorer != null) throw ERR_COORDINATE_CELL_STORAGE_NOT_INITIALIZED;
            assert (in.senderAddress == ccStorage.firstExplorer!) throw ERR_NOT_FIRST_EXPLORER;
            
            val currentBalance = contract.getOriginalBalance();
            
            val minRequiredBalance = BASIC_STORAGE_TAX * WITHDRAW_TON_MIN_BALANCE_MULTIPLIER;
            assert (currentBalance - in.valueCoins >= minRequiredBalance + msg.amount) throw ERR_NOT_ENOUGH_BALANCE;
            
            // Reserve value before sending withdrawal
            reserveValue(in.valueCoins);
            val withdrawMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.recipient,
                value: msg.amount,
                body: ReturnExcessesBack {
                    queryId: msg.queryId
                }
            });
            // Use send_mode=128 to carry all remaining balance (excesses)
            withdrawMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        WithdrawJetton => {
            var storage = lazy CoordinateCellStorage.load();
            assert (storage.ccStorage != null) throw ERR_COORDINATE_CELL_STORAGE_NOT_INITIALIZED;
            var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            assert (ccStorage.firstExplorer != null) throw ERR_COORDINATE_CELL_STORAGE_NOT_INITIALIZED;
            assert (in.senderAddress == ccStorage.firstExplorer!) throw ERR_NOT_FIRST_EXPLORER;
            
            // Send AskToTransfer to CoordinateCell's jetton wallet
            // The wallet will transfer jettons to the recipient
            val coordinateCellAddress = contract.getAddress();
            val forwardPayload = beginCell().storeUint(FORWARD_PAYLOAD_MARKER, 128).toSlice();
            reserveValue(in.valueCoins);
            val askToTransferMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: msg.jettonWalletAddress,
                value: msg.forwardTonAmount + GAS_COST_WITHDRAW_JETTON, // forward amount + gas for wallet operations
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
            // Use send_mode=128 to carry all remaining balance (excesses)
            askToTransferMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        WithdrawNFT => {
            var storage = lazy CoordinateCellStorage.load();
            assert (storage.ccStorage != null) throw ERR_COORDINATE_CELL_STORAGE_NOT_INITIALIZED;
            var ccStorage: CCStorage = lazy storage.ccStorage!.load();
            assert (ccStorage.firstExplorer != null) throw ERR_COORDINATE_CELL_STORAGE_NOT_INITIALIZED;
            assert (in.senderAddress == ccStorage.firstExplorer!) throw ERR_NOT_FIRST_EXPLORER;
            
            // Send Transfer message to NFT contract (TEP-62 standard)
            // Use helper function to encode TEP-62 format correctly (MsgAddress encoding for optional addresses)
            reserveValue(in.valueCoins);
            val emptyForwardPayload: RemainingBitsAndRefs = beginCell().endCell().beginParse();
            val nftTransferBody = encodeNFTTransfer(
                msg.queryId,
                msg.recipient,
                msg.responseDestination,
                msg.customPayload,
                msg.forwardTonAmount,
                emptyForwardPayload
            );
            
            val nftTransferMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: msg.nftAddress,
                value: msg.forwardTonAmount + GAS_COST_WITHDRAW_NFT, // forward amount + gas for NFT operations
                body: nftTransferBody
            });
            // Use send_mode=128 to carry all remaining balance (excesses)
            nftTransferMsg.send(SEND_MODE_CARRY_ALL_REMAINING_BALANCE);
        }
        ReturnExcessesBack => {}
        LiteralyAnything => {}
        else => {
            assert (in.body.isEmpty()) throw ERR_UNKNOWN_MESSAGE
        }
    }
}
