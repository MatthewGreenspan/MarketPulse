# MarketPulse

A full-stack real-time crypto and stock market dashboard with AI-powered buy-in suggestions, user authentication, and price alerting.

Built as a portfolio project by Matthew Greenspan (UF CS, Class of 2028).

---

## What It Does

- Tracks real-time prices for 10 assets: BTC, ETH, SOL, ADA, LINK, AAPL, MSFT, GOOGL, AMZN, NVDA
- Fetches prices every 10 minutes via CoinGecko (crypto) and Alpha Vantage (stocks)
- Dashboard overview: stat cards (top 24h gainer/loser, most active, assets tracked), a live price chart, and a Top Assets list
- **Guest mode** — "Continue as guest" opens the full dashboard on real data with no account; the watchlist and alerts panels show a locked preview that prompts sign-up
- Per-user watchlists and price alerts (once signed in)
- JWT-based authentication with bcrypt password hashing
- Light and dark mode

---

## Tech Stack

**Backend**
- Python + FastAPI — REST API with automatic Swagger docs at `/docs`
- SQLAlchemy ORM — Python-to-PostgreSQL interface
- PostgreSQL — relational database with 5 tables
- APScheduler — background job that fetches prices on a schedule
- bcrypt — password hashing
- python-jose — JWT token generation and verification
- email-validator — email format validation on signup (via Pydantic `EmailStr`)

**Frontend**
- TypeScript — compiled to JavaScript via tsc
- Chart.js — price chart rendering
- Vanilla DOM manipulation — no frontend framework

**APIs**
- CoinGecko API (no key required) — crypto prices
- Alpha Vantage API (free key) — stock prices

---

## Project Structure

```
market-dashboard/
├── backend/
│   ├── main.py              # FastAPI app entry point, router registration, scheduler startup
│   ├── models.py            # SQLAlchemy models (Asset, PriceHistory, Watchlist, Alert, User)
│   ├── database.py          # Database connection and SessionLocal
│   ├── dependencies.py      # JWT auth dependency (get_current_user)
│   ├── seed.py              # Seeds the database with 10 assets
│   ├── requirements.txt     # Python dependencies
│   ├── .env                 # Environment variables (not in git)
│   ├── migrations/          # One-off schema migrations, run by hand
│   ├── routers/
│   │   ├── assets.py        # GET /assets/, GET /assets/summary, GET /assets/{symbol}/prices
│   │   ├── watchlist.py     # GET/POST/DELETE /watchlist/ (auth required)
│   │   ├── alerts.py        # GET/POST/DELETE /alerts/ (auth required)
│   │   └── auth.py          # POST /auth/signup, POST /auth/login
│   └── services/
│       ├── price_fetcher.py # Fetches prices from CoinGecko and Alpha Vantage
│       └── alert_checker.py # Checks if any alerts have been triggered after each fetch
├── frontend/
│   ├── index.html           # Auth gate + dashboard (nav, chart, watchlist, alerts)
│   ├── style.css            # Design tokens + dark/light theme using CSS variables
│   ├── tsconfig.json        # TypeScript compiler config
│   ├── package.json         # npm scripts (build, watch)
│   └── src/
│       ├── api.ts           # All HTTP calls to FastAPI using fetch() and async/await
│       └── main.ts          # DOM manipulation, event listeners, chart rendering
```

---

## Database Schema

**assets** — the 10 tracked assets (symbol, name, type, coingecko_id)

**price_history** — price snapshots fetched every 10 minutes (asset_id, price_usd, volume_24h, market_cap, fetched_at)

**watchlist** — per-user list of assets to track (user_id, asset_id)

**alerts** — per-user price alerts (user_id, asset_id, condition, target_price, is_triggered)

**users** — registered users (email, password_hash)

---

## How Auth Works

The dashboard runs in one of two modes: **guest** (no token) or **authenticated** (JWT token in memory).

- **Guest:** the "Continue as guest" button on the auth page opens the dashboard using only the public endpoints (`/assets/`, `/assets/summary`, `/assets/{symbol}/prices`). The watchlist and alerts panels render a locked preview; any attempt to interact routes to the signup page. No protected endpoint is ever called as a guest.
- **Authenticated:** signing in loads the same dashboard plus the user's real watchlist and alerts.

Accounts are identified by email — there is no username.

1. User signs up with email + password → email is validated (format via `EmailStr`, plus a blocklist of placeholder and disposable domains) and the password is hashed with bcrypt → stored in `users` table
2. Server returns a JWT token signed with `SECRET_KEY`
3. Frontend stores token in memory and sends it as `Authorization: Bearer <token>` header on every protected request
4. `get_current_user` dependency in `dependencies.py` validates the token and returns the current user
5. Watchlist and alert endpoints filter by `user_id` so users only see their own data

The login/signup page gates the dashboard: nothing renders until a token exists. Since the token lives in memory, a page refresh returns you to the sign-in page (see `TODO.md`).

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

Then go to `http://localhost:8000`

Swagger API docs available at `http://localhost:8000/docs`

---

## Environment Variables

Create `backend/.env` with:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/market_dashboard
ALPHA_VANTAGE_API_KEY=your_key_here
SECRET_KEY=your_secret_key_here
```

---

## Roadmap (v2)

See `TODO.md` for the full list of planned improvements including UUIDs, rate limiting, CORS, email verification, password reset, prediction engine, and Railway deployment.
