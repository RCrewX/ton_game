# TON Game - Smart Contract System

A decentralized game built on the TON blockchain where players explore a 2D coordinate grid, battle cells, earn jettons, and upgrade their ships.

## Overview

This project implements a complete game system on TON blockchain using Tolk (Tact-like language). Players control ships that move through coordinate cells, each with random HP and rewards. Ships can explore new cells, battle existing ones, and earn jettons as rewards. Players can also upgrade their ships by transferring jettons to the game manager.

## Features

- **Ship Movement**: Navigate through a 2D coordinate grid (X can be negative, Y always positive)
- **Combat System**: Battle cells with HP-based combat mechanics
- **Rewards**: Earn jettons by exploring cells and completing safe exits
- **Ship Upgrades**: Transfer jettons to upgrade ship HP
- **First Explorer Rights**: First player to explore a cell can withdraw accumulated TON and jettons
- **Deterministic Addresses**: Ships, cells, and subcontracts have deterministic addresses for efficient on-demand deployment
- **Subcontract System**: Technical contracts for message redirection, allowing owners to deploy ships for users without wallets

## Project Structure

```
ton_game/
├── contracts/          # Tolk smart contract source code
│   ├── game/          # Game, Ship, and CoordinateCell contracts
│   ├── game_manager/  # GameManager contract
│   ├── subcontract/   # Subcontract contract (message redirection)
│   └── jetton/        # Jetton minter and wallet contracts
├── wrappers/          # TypeScript wrapper classes for contracts
├── tests/             # Comprehensive test suite
├── scripts/           # Deployment and utility scripts
├── build/             # Compiled contracts and deployment artifacts
└── compilables/       # Contract compilation configurations
```

## Prerequisites

- Node.js (v18 or higher)
- npm or pnpm
- TON wallet with testnet/mainnet TON for deployment

## Installation

```bash
# Install dependencies
npm install
# or
pnpm install
```

## Development

### Build Contracts

Compile all Tolk contracts to FunC:

```bash
npm run build
# or
npx blueprint build
```

### Run Tests

Run the test suite using Jest with TON Sandbox:

```bash
npm test
# or
npx blueprint test
```

### Generate Private Key

Generate a new private key for deployment:

```bash
npm run generate-key
# or
ts-node scripts/generatePrivateKey.ts
```

This will:
- Generate a 24-word mnemonic phrase
- Create a private key file (`.privatekey`)
- Display wallet addresses for both V4 and V5 wallets
- Show addresses for both testnet and mainnet

## Deployment

### Setup

1. Generate a private key (see above)
2. Add to `.env` file:
   ```
   PRIVATE_KEY=your_128_hex_character_private_key
   JETTON_CONTENT_URI=https://your-jetton-metadata.json  # Optional
   ```

### Deploy to Testnet

```bash
npm run deploy
# or
npx blueprint run deploySystem
# or
clear && pnpm build --all && pnpm blueprint run deploySystem --testnet --mnemonic
```

The deployment script will:
1. Deploy GameManager contract
2. Deploy Game contract
3. Deploy JettonMinter contract
4. Deploy owner's JettonWallet
5. Deploy owner's Ship
6. Configure GameManager (set jetton minter and game address)
7. Mint initial jettons to owner

Deployment information is saved to `build/deployment-{network}-{timestamp}.json` with all contract addresses.

### Deployment Output

The deployment script generates a JSON file with:
- Network (testnet/mainnet)
- Timestamp
- Owner address (bounceable and non-bounceable formats)
- All contract addresses (bounceable and non-bounceable)
- Owner jetton balance
- Deployment status

Example:
```json
{
  "timestamp": "2025-12-13T01:51:41.955Z",
  "network": "testnet",
  "ownerAddress": {
    "bounceable": "kQ...",
    "nonBounceable": "0Q..."
  },
  "gameManager": {
    "bounceable": "kQ...",
    "nonBounceable": "0Q..."
  },
  "game": { ... },
  "jettonMinter": { ... },
  "status": "completed"
}
```

## Game Mechanics

### Coordinate System

- **X-axis**: int256 (can be negative, e.g., -10, 0, 10)
- **Y-axis**: uint256 (always positive, starts at 0)
- Starting position: (0, 0)

### Movement Modes

- **UP**: Move up (x stays same, y increases by 1)
- **LEFT**: Move left (x decreases by 1, y increases by 1)
- **RIGHT**: Move right (x increases by 1, y increases by 1)
- **EXIT**: Safe exit (x stays same, y increases by 1, triggers safe exit if ship HP > cell HP)

### Combat System

When a ship moves to a cell:
- **First Exploration**: Cell generates random HP (0 to Y-1) and jetton reward (0 to Y-1)
- **Combat Resolution**:
  - If `ship_hp > cell_hp`: Ship continues, HP reduced by cell HP
  - If `ship_hp > cell_hp` + EXIT mode: Safe exit, full reward, ship resets to (0,0)
  - If `ship_hp <= cell_hp`: Ship crashes, 10% reward, ship resets to (0,0)

### Rewards

- **First Explorer**: Receives full `jettonAmount` when first opening a cell
- **Subsequent Explorers**: Receive `jettonAmount / y` (fractional reward)
- **Safe Exit**: Full accumulated rewards
- **Crash**: 10% of accumulated rewards

### Ship Upgrades

Transfer jettons to GameManager with ship address in forward payload:
1. User transfers jettons from their JettonWallet to GameManager
2. GameManager receives transfer notification
3. HP increase calculated: `random(1 to jettonAmount)`
4. Ship HP and max_hp increased by calculated amount

### First Explorer Rights

The first player to explore a cell becomes the "first explorer" and can:
- Withdraw accumulated TON from the cell
- Withdraw accumulated jettons from the cell's jetton wallet

## Contract Architecture

### GameManager
- Root contract managing the game system
- Owns JettonMinter (as admin)
- Stores game instance addresses
- Handles jetton transfers for ship upgrades
- Owner-controlled configuration

### Game
- Game instance contract
- Manages ship and coordinate cell codes
- Forwards mint requests to GameManager
- Handles ship upgrade requests from GameManager
- Provides address calculation utilities

### Ship
- Player ship contract (one per user)
- Stores user address, game address, and game state
- Handles movement requests from user
- Receives move results from coordinate cells
- Manages HP and accumulated rewards

### CoordinateCell
- Grid cell contract (one per coordinate, deployed on-demand)
- Stores cell HP, jetton reward, and first explorer
- Handles ship movement and combat
- Manages withdrawals for first explorer

### JettonMinter & JettonWallet
- Standard TON jetton implementation
- Used for game rewards and upgrades

### Subcontract
- Technical contract for message redirection
- Created with owner address and unique ID
- Owner can redirect any message to any destination
- Enables deploying ships for users without wallets
- Use case: Owner deploys ships with SubContract(id) as userAddress, then redirects move requests through subcontract to ship

## Testing

The project includes comprehensive tests covering:
- Contract deployment
- Ship movement in all directions
- Combat mechanics (continue, crash, safe exit)
- Ship upgrades via jetton transfers
- Jetton minting and transfers
- Withdrawals (TON and jettons)
- State queries
- Gas consumption
- Address calculations
- Subcontract message redirection

Run specific test files:
```bash
npm test -- ship-movement.spec.ts
npm test -- ship-upgrade.spec.ts
```

## Gas Costs

Estimated gas costs (in TON):
- `GAS_COST_REQUEST_TO_MOVE`: 0.07 TON
- `GAS_COST_REQUEST_SHIP_ADDRESS`: 0.014 TON
- `GAS_COST_REQUEST_COORDINATE_CELL_ADDRESS`: 0.015 TON
- `GAS_COST_SET_JETTON_MINTER_ADDRESS`: 0.02 TON
- `GAS_COST_SET_GAMES`: 0.015 TON
- `GAS_COST_REDIRECT_MESSAGE`: 0.005 TON (GameManager and Subcontract)

## Constants

- `BASIC_SHIP_HP`: 100 (initial ship HP)
- `BASIC_STORAGE_TAX`: 0.01 TON (minimum storage fee)
- `MINT_TON_AMOUNT`: 0.2 TON (TON required for minting jettons)

## Scripts

- `npm run build` - Build all contracts
- `npm test` - Run test suite
- `npm run deploy` - Deploy system to network
- `npm run generate-key` - Generate new private key
- `npm start` - Run blueprint CLI
- `npm run release` - Package and publish (if applicable)

## Blueprint Commands
<!-- pnpm move-ship --testnet --mnemonic -- --exit  -->
<!-- pnpm move-ship --testnet --mnemonic -- --left -->
- `npx blueprint build` - Build contracts
- `npx blueprint test` - Run tests
- `npx blueprint run <script>` - Run deployment script
- `npx blueprint create <ContractName>` - Create new contract template

## Security Considerations

- Private keys should never be committed to version control
- Use `.env` file for sensitive configuration (add to `.gitignore`)
- Test thoroughly on testnet before mainnet deployment
- Review gas costs and ensure sufficient balance
- Verify contract addresses after deployment

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit a pull request

## License

[Add your license here]

## Support

For issues and questions:
- Check existing test files for usage examples
- Review contract source code in `contracts/`
- Check deployment JSON files in `build/` for address formats

## Related Projects

- **ton_site**: Frontend web application for visualizing and interacting with the game
- Uses deployment JSON files from this repository for contract addresses
