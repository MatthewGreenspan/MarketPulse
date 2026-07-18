# MarketPulse — Architecture & Code Walkthrough

A per-file map of the codebase for quick review and interview prep. Each entry says
what the file does, its key pieces, and — under **Be ready to explain** — the thing an
interviewer is most likely to probe. A **Known rough edges** section at the end lists the
honest weak spots so none of them catch you off guard.

---

## How the app fits together

```
Browser (index.html + dist/*.js)
   │  fetch()  ── same origin ──▶  FastAPI (main.py)
   │                                 ├─ /assets/*     public
   │                                 ├─ /auth/*        signup / login → JWT
   │                                 ├─ /watchlist/*   JWT-protected, per-user
   │                                 └─ /alerts/*      JWT-protected, per-user
   │                                 │
   │                                 ├─ APScheduler ── every 5 min ──▶ CoinGecko (crypto)
   │                                 │                              └▶ yfinance (stocks)
   │                                 │        └─ writes price_history, then checks alerts
   │                                 └─ SQLAlchemy ──▶ PostgreSQL
```

The FastAPI app both serves the static frontend (mounted at `/`) and answers the API, so
in local dev and a bundled deploy everything is one origin.

---

## Backend (`backend/`)

### `main.py`
App entry point. Creates the `FastAPI` app, wires rate-limiting middleware + the 429
handler, optionally adds CORS (only when `FRONTEND_ORIGIN` is set), creates tables via
`models.Base.metadata.create_all`, registers the four routers, mounts the frontend as
static files, and starts two APScheduler jobs (crypto + stocks, every 5 min) on startup.
- **Be ready to explain:** why the scheduler lives *inside* the web process (simple single-
  instance deploy) and its trade-off (jobs stop if the web process sleeps; wouldn't scale
  to multiple replicas without moving to a dedicated worker). Also why CORS is conditional:
  same-origin bundled deploy needs none.

### `database.py`
Creates the SQLAlchemy `engine` from `DATABASE_URL`, the `SessionLocal` factory, the
declarative `Base`, and the `get_db()` dependency that yields a session and always closes it.
- **Be ready to explain:** the `get_db` generator pattern — one session per request,
  guaranteed cleanup via `try/finally`.

### `models.py`
Five ORM models: `Asset`, `PriceHistory`, `Watchlist`, `Alert`, `User`. Integer PKs;
`price_history` stores a row per fetch; `watchlist`/`alerts` carry `user_id`.
- **Be ready to explain:** the schema relationships and that `price_history` is append-only
  (every fetch is a new row — that's what powers the charts and the 24h change math).

### `dependencies.py`
`get_current_user`: reads the `Authorization: Bearer <token>` header, decodes the JWT with
`SECRET_KEY`, loads the `User` by the `sub` claim, and 401s on a bad/expired token or a
missing user. This is the gate every protected route depends on.
- **Be ready to explain:** how this single dependency enforces auth everywhere, and how the
  routers then filter every query by `current_user.id` — that combination is what prevents
  IDOR (user A reading user B's data).

### `rate_limit.py`
The shared slowapi `Limiter` (60/min default). `_client_ip` keys requests by IP, and when
`TRUST_PROXY` is set it trusts the first hop of `X-Forwarded-For` (needed behind Railway),
otherwise uses the socket peer IP.
- **Be ready to explain:** *why* `X-Forwarded-For` handling is gated behind an env flag —
  the header is client-spoofable, so you only trust it when a real proxy is in front.

### `seed.py`
One-shot script that inserts the tracked assets (~15 crypto, ~12 stocks). Idempotent: it
checks each symbol and skips ones already present, so re-running never duplicates.
- **Be ready to explain:** `coingecko_id` (the CoinGecko API slug) is set for crypto and
  `None` for stocks, which is how the fetcher routes each asset to the right provider.

### `routers/assets.py`
Public endpoints: `GET /assets/` (list), `GET /assets/summary` (latest price + 24h change +
volume per asset), `GET /assets/{symbol}/prices` (recent history for the chart). The 24h
change walks the newest-first history to the first row at/older than 24h ago.
- **Be ready to explain:** the 24h-change logic and why it returns `null` when there isn't a
  full day of history yet.

### `routers/auth.py`
`POST /auth/signup` and `POST /auth/login`. Signup validates the email (`EmailStr` + a
blocklist of placeholder/disposable domains) and password length via Pydantic validators,
hashes with bcrypt, and returns a JWT. Login verifies with `bcrypt.checkpw` and returns a
JWT. Both are rate-limited to 5/min.
- **Be ready to explain:** the full JWT flow (sign with `SECRET_KEY` + expiry → client sends
  as Bearer → `get_current_user` decodes) and why bcrypt is deliberately slow (work factor
  resists brute force). Also that login returns the same 401 for unknown-email and wrong-
  password so it doesn't leak which emails are registered.

### `routers/watchlist.py`
`GET/POST/DELETE /watchlist/`, all `get_current_user`-protected and filtered by `user_id`.
GET joins each watchlist row to its asset and latest price.
- **Be ready to explain:** the per-user filtering (IDOR prevention) — and see the N+1 note
  under rough edges.

### `routers/alerts.py`
`GET/POST/DELETE /alerts/` plus `GET /alerts/triggered`, protected and per-user.
`with_assets` batch-loads the referenced assets in one query to serialize alerts.
- **Be ready to explain:** `with_assets` is the batched (non-N+1) pattern — contrast it with
  the watchlist GET, which isn't batched.

### `services/price_fetcher.py`
`fetch_crypto_prices` hits CoinGecko once for all coins; `fetch_stock_prices` uses yfinance
(`fast_info`) per stock under its own `try` so one bad symbol doesn't sink the batch. The
`*_job` wrappers open a session, fetch, run the alert check, and close.
- **Be ready to explain:** why crypto is one batched request but stocks are per-symbol, and
  why yfinance replaced Alpha Vantage (the free Alpha Vantage tier capped at 25 requests/day).

### `services/alert_checker.py`
After each fetch, loads untriggered alerts, compares the latest price to each target, and
flips `is_triggered`/`triggered_at` when crossed.
- **Be ready to explain:** alerts are checked on the fetch cadence (not real-time), so the
  worst-case latency is one fetch interval.

### `migrations/001_drop_username.py`
One-off hand-run migration that dropped the old `username` column (accounts are keyed by
email now). There's no migration framework — schema is otherwise created by
`create_all`.
- **Be ready to explain:** why this is fine for a solo project but you'd reach for Alembic
  before a team/production setup.

### `tests/`
`test_summary.py` and `test_rate_limit.py`. Pytest.
- **Be ready to explain:** what's covered — and, honestly, that the auth flow isn't yet
  (listed in rough edges).

### `requirements.txt`
Pinned deps. Notables: `fastapi`, `sqlalchemy`, `psycopg2-binary`, `apscheduler`, `bcrypt`,
`python-jose`, `slowapi`, `httpx` (CoinGecko), `yfinance` (stocks).

---

## Frontend (`frontend/`)

TypeScript compiled to ES modules by `tsc` (see `tsconfig.json` / `package.json`); no
framework — direct DOM. Output lands in `dist/` and is what `index.html` loads.

### `index.html`
The whole UI: an auth gate (`#auth-view`) and the dashboard (`#app-view`). The dashboard
`<main id="dashboard" data-mode>` holds the stat row, the overview row (chart + Assets
panel), and the personal row (watchlist + alerts). The nav's avatar opens the account menu.
- **Be ready to explain:** `data-mode` on `#dashboard` — CSS `order` uses it to float the
  personal row above the chart for members and keep the chart on top for guests.

### `style.css`
Design tokens (CSS variables) for the dark/light themes, then component styles. The
dashboard is a CSS grid; `order` values do the mode-aware row swap. Includes the segmented
filter, sort buttons, and the account-menu popover.
- **Be ready to explain:** theming via CSS custom properties toggled by `data-theme`, and
  the `order`-based layout swap (no JS rebuild of the DOM to reorder).

### `src/api.ts`
Every HTTP call in one module. `BASE_URL` defaults to same-origin (overridable via
`window.__API_BASE__` for a split deploy). Holds the auth token *in memory*, exposes
`isLoggedIn`/`isGuest`, and normalizes FastAPI's error shapes into an `ApiError`.
- **Be ready to explain:** why the token is in memory (simple, immune to XSS token theft
  from storage) and its cost (a refresh logs you out — see rough edges).

### `src/main.ts`
All UI behavior: auth form + validation, the account menu, theme switching, the stat cards,
the filterable/sortable Assets panel (`assetFilter` + `assetSort` state), watchlist/alerts
rendering, and the Chart.js price chart. `enterApp`/`enterGuest` set `data-mode` and load
data.
- **Be ready to explain:** the Assets sort/filter state model and how `sortedFilteredAssets`
  keeps assets with missing data at the bottom regardless of direction.

### `src/backdrop.ts`
The animated canvas backdrop on the auth screen (simulated market movement, labeled as
such). Cosmetic; pauses when the app view is shown.

---

## Known rough edges

Honest weak spots — good to acknowledge proactively:

1. **Inconsistent error handling.** `watchlist.py` and `alerts.py` return `200 + {"error": …}`
   for "not found"/"already exists" instead of raising `HTTPException` like `auth.py`. The
   frontend compensates, but the API contract is inconsistent. (Cleanest fix: raise 404/409.)
2. **N+1 query in `GET /watchlist/`.** It loops watchlist rows and queries the asset + latest
   price per row. `alerts.py`'s `with_assets` shows the batched pattern to copy.
3. **In-memory auth token.** A page refresh drops it and returns you to sign-in. Fixing it
   (httpOnly cookie or sessionStorage) is a known trade-off between UX and token security.
4. **Sequential integer IDs.** Per-user filtering blocks cross-user access, but UUIDs would
   also remove enumeration/guessing of resource IDs.
5. **No auth-flow tests.** The most security-relevant code (signup/login, per-user isolation)
   isn't covered yet — the highest-value tests to add next.
6. **`datetime.utcnow()`** is used in a couple of places and is deprecated in modern Python
   (`datetime.now(timezone.utc)` is the replacement).
7. **Alert checking is fetch-cadence, not real-time**, and `alert_checker` commits per alert
   inside the loop — fine at this scale, worth noting under load.
