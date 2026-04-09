# ⬡ APEX — MT4/MT5 Trading Automation
> Auto Stop Loss & Take Profit for MetaTrader 4 & 5 — runs natively on macOS via MetaApi Cloud

---

## What This Does

- Connects to your MT4 and/or MT5 broker accounts via **MetaApi** (no Windows needed)
- Automatically applies **Stop Loss** and **Take Profit** to every new trade
- Supports **Trailing Stop** and **Breakeven** logic
- **Per-symbol rules** — different SL/TP for EURUSD vs XAUUSD vs GBPJPY
- Real-time **web dashboard** — live positions, P&L, trade history
- WebSocket streaming — dashboard updates every 5 seconds

---

## Prerequisites

- Node.js 18+ (install via https://nodejs.org)
- A MetaApi account (free tier available)
- Your MT4 or MT5 broker account credentials

---

## Step 1 — Create Your MetaApi Account

1. Go to **https://app.metaapi.cloud** and sign up (free)
2. Click **"Add Account"** in the dashboard
3. Enter your broker's MT4/MT5 server, login, and password
4. MetaApi will connect to your broker — wait for status **"Connected"**
5. Copy your **Account ID** from the account details page
6. Go to **API Access** → copy your **API Token**

> Do this for both MT4 and MT5 if you use both.

---

## Step 2 — Install the App

```bash
# 1. Go into the project folder
cd apex-trading-automation

# 2. Install all dependencies
npm run install:all
```

---

## Step 3 — Configure Your Credentials

```bash
# Copy the example env file
cp backend/.env.example backend/.env

# Open it in your editor
open backend/.env
```

Fill in your values:

```env
META_API_TOKEN=your_token_from_metaapi_dashboard
MT4_ACCOUNT_ID=your_mt4_account_id      # leave blank if not using MT4
MT5_ACCOUNT_ID=your_mt5_account_id      # leave blank if not using MT5
```

---

## Step 4 — Run the App

Open **two terminal windows**:

**Terminal 1 — Backend (bot engine):**
```bash
cd backend
npm run dev
```

You should see:
```
[Boot] Initializing MetaApi connections...
[MetaApi] MT5 connected ✓
[Boot] Auto SL/TP bot started — polling every 5 seconds
🚀 Server running at http://localhost:3001
```

**Terminal 2 — Frontend (dashboard):**
```bash
cd frontend
npm start
```

This opens **http://localhost:3000** in your browser automatically.

---

## How the Bot Works

```
Every 5 seconds:
  1. Fetch all open positions from MT4 + MT5
  2. For each position:
     a. Find the matching rule (symbol-specific or global)
     b. Calculate SL and TP prices
     c. If SL/TP not set (or wrong) → modify the position
     d. If trailing stop enabled → adjust SL as price moves
     e. If breakeven enabled → move SL to entry when in profit
  3. Broadcast positions to dashboard via WebSocket
```

---

## Dashboard Pages

| Page | What it shows |
|---|---|
| **Dashboard** | Account balances, floating P&L, bot status |
| **Positions** | All open trades with live SL/TP, manual edit |
| **SL/TP Rules** | Configure automation settings |
| **History** | Closed trades, profit/loss per deal |

---

## Configuring SL/TP Rules

### Mode: Fixed Pips
Set SL and TP a fixed number of pips from the entry price.
```
Entry: 1.08500 (BUY EURUSD)
SL: 50 pips → 1.08000
TP: 100 pips → 1.09500
```

### Mode: Risk/Reward Ratio
If a trade already has a Stop Loss, TP is set automatically:
```
SL is 40 pips away, R:R = 2.0 → TP = 80 pips away
```

### Trailing Stop
The SL moves along with price to lock in profits:
```
BUY at 1.0850, trailing = 30 pips
Price rises to 1.0900 → SL moves up to 1.0870
Price rises to 1.0950 → SL moves up to 1.0920
```

### Breakeven
When a trade reaches X pips in profit, SL is moved to entry:
```
BUY at 1.0850, trigger = 30 pips
Price reaches 1.0880 → SL moved to 1.0850 (entry)
```

### Per-Symbol Overrides
```
Global:  SL=50 pips, TP=100 pips
XAUUSD:  SL=200 pips, TP=400 pips  ← Gold needs wider stops
USDJPY:  SL=30 pips, TP=60 pips    ← Tighter for JPY
```

---

## Project Structure

```
apex-trading-automation/
├── backend/
│   ├── .env.example          ← Copy to .env and fill in
│   ├── package.json
│   ├── data/
│   │   └── rules.json        ← Your SL/TP rules (auto-created)
│   └── src/
│       ├── index.js           ← Server entry point
│       ├── routes/
│       │   ├── trades.js      ← /api/trades endpoints
│       │   ├── rules.js       ← /api/rules endpoints
│       │   └── accounts.js    ← /api/accounts endpoints
│       └── services/
│           ├── metaApiService.js  ← MT4/MT5 connection layer
│           ├── botService.js      ← Core SL/TP automation engine
│           └── rulesStore.js      ← Rules persistence
│
└── frontend/
    ├── package.json
    └── src/
        ├── App.js             ← App shell, navigation, WebSocket
        ├── App.css            ← Global styles
        ├── index.js           ← React entry point
        ├── services/
        │   └── api.js         ← All API calls
        └── pages/
            ├── Dashboard.js   ← Overview + stats
            ├── Positions.js   ← Open trades + manual edit
            ├── Rules.js       ← SL/TP rule configuration
            └── History.js     ← Trade history
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server health check |
| GET | `/api/accounts` | List connected accounts |
| GET | `/api/accounts/:platform/info` | Balance, equity, P&L |
| GET | `/api/trades/positions` | All open positions |
| POST | `/api/trades/modify` | Manually set SL/TP |
| GET | `/api/trades/history?days=7` | Trade history |
| GET | `/api/trades/bot/stats` | Bot status and stats |
| POST | `/api/trades/bot/toggle` | Start or stop bot |
| GET | `/api/rules` | Get all SL/TP rules |
| PUT | `/api/rules/global` | Update global rules |
| PUT | `/api/rules/symbol/:symbol` | Set per-symbol rule |
| DELETE | `/api/rules/symbol/:symbol` | Remove symbol rule |

---

## Troubleshooting

**"META_API_TOKEN is not set"**
→ Make sure you copied `.env.example` to `.env` and filled it in

**"No connection for mt4/mt5"**
→ Check that your account ID is correct and the account is "Connected" in MetaApi dashboard

**Bot not setting SL/TP?**
→ Check that automation is enabled in the Rules page
→ Check the backend terminal for error messages

**MetaApi account stuck on "Deploying"**
→ This can take 2-5 minutes the first time. Wait and restart the backend.

---

## Useful Links

- MetaApi Dashboard: https://app.metaapi.cloud
- MetaApi Docs: https://metaapi.cloud/docs
- MetaApi Pricing: https://metaapi.cloud/pricing (free tier available)
- Node.js Download: https://nodejs.org
