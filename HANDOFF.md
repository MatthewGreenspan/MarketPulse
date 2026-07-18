# MarketPulse — Handoff Document

**Last updated:** July 17, 2026  
**Developer:** Matthew Greenspan (UF CS, Class of 2028)  
**Goal:** Portfolio project for SWE/Cybersecurity/Fintech internship recruiting (Summer 2027)

---

## What This Project Is

MarketPulse is a full-stack real-time crypto and stock market dashboard. Users can create an account, build a watchlist of assets, set price alerts, and view price history charts. The site has light/dark mode and a modern dark UI.

**GitHub:** https://github.com/MatthewGreenspan/MarketPulse (private — make public before recruiting)

---

## Tech Stack

**Backend:** Python, FastAPI, SQLAlchemy ORM, PostgreSQL, APScheduler, bcrypt, python-jose (JWT), slowapi (rate limiting)  
**Frontend:** TypeScript → compiled JS via tsc, Chart.js, vanilla DOM (no framework)  
**APIs:** CoinGecko (crypto, free/no key), Alpha Vantage (stocks, 25 req/day free tier)

---

## Project Structure

```
market-dashboard/
├── backend/
│   ├── main.py              # FastAPI app, router registration, scheduler startup
│   ├── models.py            # SQLAlchemy models: Asset, PriceHistory, Watchlist, Alert, User
│   ├── database.py          # DB connection, SessionLocal
│   ├── dependencies.py      # JWT auth dependency: get_current_user
│   ├── rate_limit.py        # Shared slowapi Limiter (60/min global, 5/min on auth)
│   ├── seed.py              # Seeds 10 assets into the DB
│   ├── requirements.txt
│   ├── .env                 # NOT in git — DATABASE_URL, ALPHA_VANTAGE_API_KEY, SECRET_KEY
│   ├── routers/
│   │   ├── assets.py        # GET /assets/, GET /assets/{symbol}/prices
│   │   ├── watchlist.py     # GET/POST/DELETE /watchlist/ (auth required)
│   │   ├── alerts.py        # GET/POST/DELETE /alerts/ (auth required)
│   │   └── auth.py          # POST /auth/signup, POST /auth/login
│   ├── services/
│   │   ├── price_fetcher.py # Fetches from CoinGecko + Alpha Vantage
│   │   └── alert_checker.py # Checks if alerts triggered after each fetch
│   └── migrations/
│       └── 001_drop_username.py
├── frontend/
│   ├── index.html
│   ├── style.css            # CSS variables for dark/light theme
│   ├── tsconfig.json
│   ├── package.json         # npm run build / npm run watch
│   └── src/
│       ├── api.ts           # All HTTP calls, in-memory token storage
│       └── main.ts          # DOM, event listeners, chart rendering
├── README.md
├── TODO.md
└── HANDOFF.md               # This file
```

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

Go to `http://localhost:8000`. Swagger docs at `http://localhost:8000/docs`.

**backend/.env** (create this — never commit it):
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/market_dashboard
ALPHA_VANTAGE_API_KEY=your_key_here
SECRET_KEY=your_secret_key_here
```

---

## Key Architecture Decisions

**Auth:** JWT tokens. Login → server returns token → stored in memory (`api.ts`) → sent as `Authorization: Bearer <token>` on every protected request. Stored in-memory (not localStorage) because localStorage had issues in this environment.

**IDOR prevention:** Every watchlist/alert query filters by `current_user.id` pulled from the JWT. Users can never see each other's data.

**Scheduler:** Two APScheduler jobs — crypto every 5 min (CoinGecko, batched), stocks every 30 min (Alpha Vantage, rate-limited to 25 req/day). Both use `max_instances=1` and `coalesce=True` to prevent overlapping runs.

**Rate limiting:** slowapi — 60 req/min globally, 5 req/min on `/auth/*` endpoints.

**Password hashing:** bcrypt with cost factor 2^12 (intentionally slow to resist brute force).

---

## Database Schema

| Table | Key Columns |
|-------|-------------|
| users | id, email, password_hash, created_at |
| assets | id, symbol, name, type, coingecko_id |
| price_history | id, asset_id, price_usd, volume_24h, market_cap, fetched_at |
| watchlist | id, user_id, asset_id, added_at |
| alerts | id, user_id, asset_id, condition, target_price, is_triggered, triggered_at |

---

## Current State

### What's Working
- User signup and login with JWT
- Per-user watchlist (add/remove assets)
- Per-user price alerts (above/below a target price, triggers automatically)
- Price chart for any asset (7-day history, reversed chronologically)
- Light/dark mode toggle
- Rate limiting on all endpoints
- README.md and TODO.md in repo

### Known Issues / Pending Cleanup
- `docs/superpowers/` folder is still in the GitHub repo — needs `git rm -r --cached docs/superpowers` and push
- `.superpowers/` may also need removing if present
- Remote URL may still be `market-dashboard.git` — fix with:  
  `git remote set-url origin https://github.com/MatthewGreenspan/MarketPulse.git`
- Repo is still **private** — make public before submitting internship applications
- "claude" appears as co-author on some commits from Claude Code sessions (cosmetic, not a security issue)

---

## TODO (prioritized)

### Before going public
- [ ] Remove `docs/superpowers/` from repo (see above)
- [ ] Fix remote URL to `MarketPulse.git`
- [ ] Make repo public

### Security (before deployment)
- [ ] Replace sequential IDs with UUIDs (prevents IDOR enumeration)
- [ ] Add CORS restrictions to lock API to frontend domain only
- [ ] Fix token persistence across page refresh (httpOnly cookies or sessionStorage)
- [ ] Add email verification on signup
- [ ] Add password reset flow

### Backend
- [ ] Replace Alpha Vantage with `yfinance` (no daily limit)
- [ ] Add data retention policy — auto-delete price_history rows older than 90 days
- [ ] Move `get_db` to `dependencies.py` to eliminate duplication across routers

### Frontend
- [ ] Replace auth modal with dedicated login/signup page
- [ ] Hide watchlist/alerts forms when not logged in
- [ ] Add loading states during API calls
- [ ] Better error messages in UI (not browser alerts)
- [ ] Mobile responsive improvements

### Features (v2)
- [ ] Prediction/buy-in suggestion engine:
  - 7-day moving average
  - % below recent high
  - RSI (Relative Strength Index)
  - Suggested entry price per asset
- [ ] Email notifications when alerts trigger
- [ ] User can add any CoinGecko asset (not just the 10 seeded ones)
- [ ] Chart time range selector (1hr / 1day / 1week)

### Deployment
- [ ] Deploy backend on Railway
- [ ] Provision PostgreSQL on Railway
- [ ] Update `BASE_URL` in `api.ts` from `localhost:8000` to Railway URL
- [ ] Deploy frontend on Railway or Vercel
- [ ] Set up GitHub Actions CI/CD
- [ ] Optional: custom domain

---

## Resume Bullets (MarketPulse)

```
• Built MarketPulse, a full-stack market dashboard with FastAPI, PostgreSQL, and TypeScript;
  implemented JWT auth, bcrypt password hashing, and per-user data isolation to prevent IDOR attacks

• Engineered background price-fetching pipeline using APScheduler with two independent jobs
  (crypto every 5 min via CoinGecko, stocks every 30 min via Alpha Vantage) with coalescing
  to prevent duplicate runs under load

• Added slowapi rate limiting (60 req/min global, 5 req/min on auth endpoints) and input validation
  with Pydantic to harden the API against abuse and injection attacks
```

---

## Concepts to Know for Interviews

If asked about this project, be ready to explain:

- **JWT flow:** login → token signed with SECRET_KEY → client sends as Bearer header → `get_current_user` decodes it on every request
- **bcrypt cost factor:** 2^12 iterations makes each hash check ~300ms, making brute force impractical
- **IDOR:** filtering every DB query by `current_user.id` prevents user A from reading user B's data
- **SQLAlchemy:** Python ORM — write Python classes, it generates parameterized SQL (no SQL injection)
- **APScheduler:** runs background jobs inside the FastAPI process on a schedule
- **Foreign keys:** watchlist and alerts reference assets.id and users.id — enforces referential integrity
- **Pydantic validators:** `@field_validator` runs before data hits the DB — blocks bad emails/passwords at the API layer
- **CORS:** would restrict which domains can call the API (not yet configured — needed before deployment)
