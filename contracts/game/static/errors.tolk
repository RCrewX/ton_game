
// these error codes are quite strange, but they are exactly the same as in FunC implementation

const ERR_INVALID_OP = 709
const ERR_NOT_FROM_ADMIN = 73
const ERR_UNAUTHORIZED_BURN = 74
const ERR_NOT_ENOUGH_AMOUNT_TO_RESPOND = 75
const ERR_NOT_FROM_OWNER = 705
const ERR_NOT_ENOUGH_TON_FOR_OPERATION = 710  // Changed from 709 (was duplicate)
const ERR_NOT_ENOUGH_GAS_FOR_OPERATION = 711  // Changed from 707 (was duplicate)
const ERR_INVALID_WALLET_ADDRESS = 712  // Changed from 707 (was duplicate)
const ERR_WRONG_WORKCHAIN = 333
const ERR_NOT_ENOUGH_BALANCE = 706
const ERR_INVALID_PAYLOAD = 708

// Custom

const ERR_UNAUTHORIZED = 901
const ERR_NOT_ENOUGH_VALUE_COINS = 903
const ERR_MESSAGE_VALUE_TOO_LOW = 904  // Message value is too low (less than estimated gas cost)
const ERR_INVALID_SENDER_ADDRESS = 905  // Sender address doesn't match expected address
const ERR_MISSING_REQUIRED_DATA = 906  // Required data (like jettonMinterAddress) is null
const ERR_INSUFFICIENT_BALANCE_FOR_OPERATION = 907  // Contract balance too low for operation