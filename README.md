# YayNay Agent

An autonomous AI agent and API for managing a DAO treasury through Zora creator coin investments. Built for Builder DAO on Base mainnet.

## Features

- 🤖 **Autonomous Agent** - Runs every 12 minutes to analyze and propose creator coin investments
- 📊 **Portfolio Tracking** - Monitor DAO treasury holdings across networks
- 🔍 **AI Analysis** - OpenAI-powered evaluation of creator coins
- 📋 **Queue Management** - Persistent queue for user-submitted coin suggestions
- 🗳️ **Governor Integration** - Automatic proposal submission to Builder DAO
- ⛓️ **Blockchain Verification** - Duplicate prevention via subgraph queries

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express.js API server
- **Blockchain**: Coinbase CDP SDK (Smart Accounts on Base)
- **Creator Coins**: Zora Coins SDK
- **AI**: OpenAI GPT-4o-mini
- **Network**: Base Mainnet
- **Governance**: Builder DAO Governor contracts

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials - see `.env.example` for all required variables.

### 3. Create Agent Wallet

```bash
pnpm create:agent-wallet
```

Save the generated addresses to `.env.local`.

### 4. Fund the Agent Wallet

The Smart Account needs:
1. **ETH for gas** (~0.001 ETH)
2. **1 Builder DAO NFT** (required to create proposals)

### 5. Run

```bash
# Start API server
pnpm dev

# Run agent manually
pnpm agent

# View queue
pnpm queue:view
```

## API Endpoints

### `GET /api/queue`
Get all queued suggestions with statistics.

### `POST /api/analyze`
Analyze a creator coin by username and add to queue if promising.

### `GET /api/portfolio`
Get DAO treasury balance and holdings.

See full API documentation in code comments.

## Scripts

```bash
pnpm agent              # Run autonomous agent
pnpm queue:view         # View suggestions queue
pnpm check:balance      # Check agent wallet balance
pnpm check:governor     # Check Governor requirements
pnpm test:all           # Run all tests
```

## How It Works

1. **User submits** creator via API
2. **AI analyzes** coin metrics and creator activity
3. **If promising** (confidence >= 20%), adds to queue
4. **Agent processes** queue every 12 minutes
5. **Creates proposal** with Zora trade transaction
6. **Submits to Governor** via CDP Smart Account
7. **DAO votes** on proposal

## Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full guide including:
- PM2 process management
- Nginx reverse proxy
- Let's Encrypt SSL
- Firewall configuration

## Project Structure

```
backend/
├── lib/
│   ├── agent/           # AI analysis logic
│   └── dao/             # DAO integrations
├── scripts/             # CLI utilities
├── server.ts            # Express API
└── .env.example         # Environment template
```

## Builder DAO Integration

Integrates with [Builder DAO](https://build.top/) on Base mainnet:
- Governor: `0x2ff7852a23e408cb6b7ba5c89384672eb88dab2e`
- Treasury: `0x72b052a9a830001ce202ad907e6eedd0b86c4a88`

## License

MIT
