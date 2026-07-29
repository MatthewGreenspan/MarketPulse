# MarketPulse

A full-stack real-time crypto and stock market dashboard with rule-based entry point signals, user authentication, and price alerting.

Built as a portfolio project by Matthew Greenspan (UF CS, Class of 2028).

---

## What It Does

- Tracks real-time prices for 27 assets across crypto and stocks
- Fetches crypto prices every 3 minutes via CoinGecko; stock prices every 5 minutes via yfinance
- Dashboard overview: stat cards (top 24h gainer/loser, most active, assets tracked), a live price chart, and a Top Assets list
- **Signal engine** — computes RSI (14-period), 7-day moving average, % below recent high, and a suggested entry price per asset; classifies each as `oversold`, `dip`, `neutral`, or `overbought`
- **Guest mode** — "Continue as guest" opens the full dashboard on real data with no account; watchlist and alerts panels show a locked preview that prompts sign-up
- Per-user watchlists and price alerts (once signed in)
- JWT-based authentication with bcrypt password hashing
- Per-IP rate limiting on every endpoint (stricter on auth) to blunt brute-force and spam
- Light and dark mode

---

## Tech Stack

**Backend**
- Python + FastAPI — REST API with automatic Swagger docs at `/docs`
- SQLAlchemy ORM — Python-to-PostgreSQL interface
- PostgreSQL — relational database with 5 tables (UUID primary keys)
- APScheduler — background jobs that fetch prices on a schedule
- bcrypt — password hashing
- python-jose — JWT token generation and verification
- email-validator — email format + disposable domain validation on signup
- slowapi — per-IP rate limiting on the API

**Frontend**
- TypeScript — compiled to JavaScript via tsc (no framework)
- Chart.js — live price chart rendering
- Vanilla DOM manipulation + CSS Grid

**Data Sources**
- CoinGecko API (no key required) — crypto prices, batched per fetch
- yfinance — stock prices, per-symbol

---

## Project Structure

```
MarketPulse/
├── backend/
│   ├── main.py              # FastAPI app entry point, router registration, scheduler startup
│   ├── models.py            # SQLAlchemy models (Asset, PriceHistory, Watchlist, Alert, User)
│   ├── database.py          # Database connection and SessionLocal
│   ├── dependencies.py      # JWT auth dependency (get_current_user)
│   ├── rate_limit.py        # Shared slowapi Limiter (per-IP request budgets)
│   ├── seed.py              # Seeds the database with tracked assets
│   ├── requirements.txt     # Python dependencies
│   ├── .env                 # Environment variables (not in git)
│   ├── migrations/          # One-off schema migrations, run by hand
│   ├── routers/
│   │   ├── assets.py        # GET /assets/, /assets/summary, /assets/signals, /{symbol}/prices, /{symbol}/signals
│   │   ├── watchlist.py     # GET/POST/DELETE /watchlist/ (auth required)
│   │   ├── alerts.py        # GET/POST/DELETE /alerts/, /alerts/triggered (auth required)
│   │   └── auth.py          # POST /auth/signup, POST /auth/login
│   └── services/
│       ├── price_fetcher.py # Fetches prices from CoinGecko (crypto) and yfinance (stocks)
│       ├── alert_checker.py # Checks if any alerts have been triggered after each fetch
│       └── signals.py       # RSI, moving average, and entry point signal computation
├── frontend/
│   ├── index.html           # Auth gate + dashboard (nav, chart, watchlist, alerts)
│   ├── style.css            # Design tokens + dark/light theme using CSS variables
│   ├── tsconfig.json        # TypeScript compiler config
│   ├── package.json         # npm scripts (build, watch)
│   └── src/
│       ├── api.ts           # All HTTP calls to FastAPI using fetch() and async/await
│       ├── main.ts          # DOM manipulation, event listeners, chart rendering
│       └── backdrop.ts      # Animated canvas backdrop on the auth screen
```

---

## Signal Engine

`GET /assets/signals` returns trading signals for all assets. `GET /assets/{symbol}/signals` returns signals for one asset.

Each response includes:

| Field | Description |
|-------|-------------|
| `rsi_14` | 14-period RSI — below 30 = oversold, above 70 = overbought |
| `moving_avg_7d` | Average price over the last 7 days of data |
| `recent_high_7d` | Highest price in the last 7 days |
| `pct_below_high` | How far (%) current price sits below the recent high |
| `suggested_entry` | Price level to consider as an entry point |
| `signal` | `oversold` / `dip` / `neutral` / `overbought` / `no_data` |

**Signal logic:**
- `oversold` (RSI < 30) → suggested entry = current price
- `overbought` (RSI > 70) → suggested entry = 7d MA × 0.97 (wait for pullback)
- `dip` (price < 7d MA × 0.97) → suggested entry = current price
- `neutral` → suggested entry = 7d MA × 0.97
- `no_data` → price history is flat (e.g. stocks outside market hours)

---

## Database Schema

**assets** — tracked assets (symbol, name, type, coingecko_id)

**price_history** — price snapshots per fetch (asset_id, price_usd, volume_24h, market_cap, fetched_at)

**watchlist** — per-user tracked assets (user_id, asset_id)

**alerts** — per-user price alerts (user_id, asset_id, condition, target_price, is_triggered)

**users** — registered users (email, password_hash)

All tables use UUID primary keys.

---

## How Auth Works

The dashboard runs in one of two modes: **guest** (no token) or **authenticated** (JWT token in memory).

- **Guest:** "Continue as guest" opens the dashboard using only public endpoints. Watchlist and alerts show a locked preview. No protected endpoint is ever called as a guest.
- **Authenticated:** signing in loads the same dashboard plus the user's real watchlist and alerts.

1. Signup: email validated (format + disposable domain blocklist), password hashed with bcrypt → stored in `users`
2. Server returns a JWT signed with `SECRET_KEY`
3. Frontend stores token in memory, sends as `Authorization: Bearer <token>` on protected requests
4. `get_current_user` dependency validates the token and returns the current user
5. All watchlist and alert queries filter by `user_id` — users only see their own data

---

## Rate Limiting

| Scope | Limit (per IP) | Why |
|-------|----------------|-----|
| Global default (all routes) | 60 / minute | Bounds load per client |
| `POST /auth/login`, `POST /auth/signup` | 5 / minute | Blunts brute-force and spam |

Returns HTTP 429 on breach. Behind a proxy (Railway), set `TRUST_PROXY=1` to key limits off `X-Forwarded-For` instead of the proxy IP.

---

## Running Locally

**Backend:**
```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm run watch
```

Then go to `http://localhost:8000`. Swagger docs at `http://localhost:8000/docs`.

---

## Environment Variables

Create `backend/.env`:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/marketpulse
SECRET_KEY=your_secret_key_here
```

---

## Roadmap

See `TODO.md` for planned improvements including email verification, password reset, token persistence, trade logging, P&L tracking, and Railway deployment.
