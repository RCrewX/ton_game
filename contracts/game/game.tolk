import "static/messages"
import "static/helper"
import "static/storage"
import "static/structs"
import "static/constants"

type AllowedMessagesToGame = 
    | RequestMint 
    | RequestShipAddress 
    | RequestCoordinateCellAddress 
    | AnyMessage

// get fun get_ship_address(userAddress: address): address {
//     var storage: GameV1Storage = lazy GameV1Storage.load();
//     return calcAddressOfShip(userAddress, contract.getAddress(), storage.shipCode, storage.coordinateCellCode);
// }

// get fun get_coordinate_cell_address(xy: XY): address {
//     var storage: GameV1Storage = lazy GameV1Storage.load();
//     return calcAddressOfCoordinateCell(contract.getAddress(), xy.x, xy.y,  storage.coordinateCellCode, storage.shipCode);
// }

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessagesToGame.fromSlice(in.body);
    var storage = lazy GameV1Storage.load();
    match (msg) {
        RequestShipAddress => {
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
            val the_slice = msg.proof.data.toSlice();

            if (msg.proof.mode == 0) {    
                val xy: XY = XY.fromSlice(the_slice);
                assert (in.senderAddress == calcAddressOfCoordinateCell(contract.getAddress(),  xy.x, xy.y, storage.coordinateCellCode, storage.shipCode)) throw 5;
            } else 
            if (msg.proof.mode == 1) {
                val user: address = address.fromSlice(the_slice);
                assert (in.senderAddress == calcAddressOfShip(user, contract.getAddress(),  storage.shipCode, storage.coordinateCellCode)) throw 5;
            } else {
                assert (false) throw 5;
            }
            // Forward mint request to game manager (proof already verified, so send simplified message)
            reserveValue(in.valueCoins);
            val forwardMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: storage.managerAddress,
                value: in.valueCoins,
                body: ForwardMintRequest {
                    receiver: msg.receiver,
                    amount: msg.amount,
                }
            });
            forwardMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
        ReturnExcessesBack => {}
        LiteralyAnything => {}
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}