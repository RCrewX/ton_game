
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

const ERR_UNAUTHORIZED = 901  // Generic unauthorized (kept for backward compatibility)
const ERR_NOT_ENOUGH_VALUE_COINS = 903
const ERR_MESSAGE_VALUE_TOO_LOW = 904  // Message value is too low (less than estimated gas cost)
const ERR_INVALID_SENDER_ADDRESS = 905  // Sender address doesn't match expected address
const ERR_MISSING_REQUIRED_DATA = 906  // Required data (like jettonMinterAddress) is null
const ERR_INSUFFICIENT_BALANCE_FOR_OPERATION = 907  // Contract balance too low for operation

// Ship-specific errors
const ERR_GAME_FIELDS_NOT_INITIALIZED = 908  // Ship gameFields is null when it should be initialized
const ERR_MOVEMENT_NOT_IN_PROCESS = 909  // Movement is not in process when it should be
const ERR_MOVEMENT_ALREADY_IN_PROCESS = 910  // Movement is already in process when it should not be
const ERR_INVALID_COORDINATE_CELL_SENDER = 911  // Sender is not the expected coordinate cell address
const ERR_INVALID_USER_SENDER = 912  // Sender is not the ship's user address
const ERR_INVALID_GAME_SENDER = 913  // Sender is not the ship's game address

// Game-specific errors
const ERR_INVALID_GAME_MANAGER_SENDER = 914  // Sender is not the game's manager address
const ERR_INVALID_SHIP_SENDER_FOR_MINT = 915  // Sender is not the expected ship address for mint request

// CoordinateCell-specific errors
const ERR_COORDINATE_CELL_STORAGE_NOT_INITIALIZED = 916  // Coordinate cell storage (ccStorage) is null
const ERR_NOT_FIRST_EXPLORER = 917  // Sender is not the first explorer of this coordinate cell
const ERR_INVALID_COORDINATE_CELL_SENDER_FOR_MOVE = 918  // Sender is not the expected coordinate cell for Move message
const ERR_INVALID_SHIP_SENDER_FOR_MOVE = 919  // Sender is not the expected ship for MoveShipToCC message
const ERR_UNKNOWN_MESSAGE = 0xFFFF  // Unknown message type (body not empty but doesn't match any known message)