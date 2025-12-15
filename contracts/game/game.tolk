import "static/messages"
import "static/helper"
import "static/storage"
import "static/structs"
import "static/constants"
import "static/errors"

type AllowedMessagesToGame = 
    | RequestMint 
    | RequestShipAddress 
    | RequestCoordinateCellAddress 
    | UpgradeShipRequest
    | AnyMessage

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToGame.fromSlice(in.body);
    var storage = lazy GameV1Storage.load();
    match (msg) {
        RequestShipAddress => {
            assert (in.valueCoins >= GAS_COST_REQUEST_SHIP_ADDRESS) throw ERR_MESSAGE_VALUE_TOO_LOW;
            reserveValue(in.valueCoins);
            val responseMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ResponseAddress {
                    requestedAddress: calcAddressOfShip(msg.userAddress, contract.getAddress(), storage.shipCode, storage.coordinateCellCode),
                }
            });
            responseMsg.send(SEND_MODE_IGNORE_ERRORS + 128);
        }
        RequestCoordinateCellAddress => {
            assert (in.valueCoins >= GAS_COST_REQUEST_COORDINATE_CELL_ADDRESS) throw ERR_MESSAGE_VALUE_TOO_LOW;
            reserveValue(in.valueCoins);
            val responseMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ResponseAddress {
                    requestedAddress: calcAddressOfCoordinateCell(contract.getAddress(), msg.xy.x, msg.xy.y,  storage.coordinateCellCode, storage.shipCode),
                }
            });
            responseMsg.send(SEND_MODE_IGNORE_ERRORS + 128);
        }
        RequestMint => {

            assert (in.valueCoins > BASIC_STORAGE_TAX) throw ERR_NOT_ENOUGH_VALUE_COINS;
            assert (in.senderAddress == calcAddressOfShip(msg.receiver, contract.getAddress(),  storage.shipCode, storage.coordinateCellCode)) throw ERR_INVALID_SENDER_ADDRESS;

            reserveValue(in.valueCoins);

            val forwardMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: storage.managerAddress,
                value: 0,
                body: ForwardMintRequest {
                    receiver: msg.receiver,
                    amount: msg.amount,
                }
            });
            forwardMsg.send(128);
        }
        UpgradeShipRequest => {
            // Only GameManager can request ship upgrades
            assert (in.senderAddress == storage.managerAddress) throw ERR_UNAUTHORIZED;
            
            reserveValue(in.valueCoins);
            
            // Send upgrade message to Ship
            val upgradeMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.shipAddress,
                value: 0,
                body: ShipUpgrade {
                    hpIncrease: msg.hpIncrease,
                }
            });
            upgradeMsg.send(128);
        }
        ReturnExcessesBack => {}
        LiteralyAnything => {}
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}