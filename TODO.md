# MarketPulse — TODO / Needed Changes

## Security (must do before deployment)
- [ ] Replace sequential integer IDs with UUIDs on all tables (prevents IDOR attacks)
- [ ] Add rate limiting with `slowapi` on auth and API endpoints
- [ ] Add CORS restrictions so only the frontend domain can call the API
- [ ] Fix token persistence — currently resets on page refresh (use httpOnly cookies or sessionStorage).
      More visible now that the login page gates the dashboard: a refresh drops you back to sign-in.
- [ ] Add email verification on signup (format + disposable-domain checks are done; ownership is not proven)
- [ ] Add password reset flow
- [x] Email-only accounts — `username` dropped from the users table (`migrations/001_drop_username.py`)

## Backend
- [x] Split the scheduler by source — crypto every 5 min, stocks every 30 min
- [x] Add public `GET /assets/summary` — per-asset latest price, 24h % change, and volume (powers the dashboard stat cards and Top Assets list). Covered by `tests/test_summary.py`.
- [ ] **Stock prices are broken: the Alpha Vantage free key is exhausted.** The free tier allows
      ~25 requests/day and `GLOBAL_QUOTE` costs 1 request per symbol, so even 5 stocks
      (720 req/day at the old 10-min interval) blows through it. Evidence: `price_history` holds
      exactly 25 stock rows — AAPL 13, AMZN 12, and GOOGL/MSFT/NVDA have never recorded a price.
      Fix by choosing one:
        - a provider with batch quotes on a free tier (Finnhub, Twelve Data, yfinance)
        - a paid Alpha Vantage plan
        - fetching a small rotating subset of symbols per run
- [ ] Add S&P 500 assets — **blocked on the above.** 503 symbols × 48 runs/day = ~24,100 requests/day
      against a 25/day quota. A single full pass costs 503 requests, so this is not reachable by
      changing the interval; it needs a different data source.
- [ ] Add data retention policy — auto-delete price_history rows older than 90 days
      (more urgent now that crypto writes 12×/hour)
- [ ] Add `slowapi` rate limiting (max requests per IP per minute)
- [ ] Move `get_db` dependency to `dependencies.py` and remove duplicates in routers

## Frontend
- [x] Redesign with proper UI — component library or better CSS
- [x] Replace auth modal with a dedicated login/signup page
- [x] Show asset name instead of "Asset ID #5" in alerts panel
- [x] Show account icon in nav (avatar; email intentionally not displayed)
- [x] Hide watchlist/alerts add forms when not logged in
- [x] Mobile responsive improvements
- [x] Add loading states while API calls are in progress
- [x] Better error messages (inline field errors on auth, toasts elsewhere — no browser alerts)
- [x] Light mode polish
- [x] Guest mode — "Continue as guest" opens the dashboard on real data; watchlist/alerts show a locked preview that prompts sign-up (guests never call protected endpoints)
- [x] Finova-style dashboard — stat cards (top gainer/loser, most active, assets tracked), chart + Top Assets list, watchlist/alerts row
- [ ] Chart time range selector (see Features)

## Features (v2)
- [ ] Prediction/buy-in suggestion engine
  - 7-day moving average calculation
  - % below recent high detection
  - RSI (Relative Strength Index) indicator
  - Suggested entry price displayed per asset
- [ ] Email notifications when alerts trigger
- [ ] More assets (user can add any CoinGecko asset, not just the 10 seeded ones)
- [ ] Portfolio tracking (track holdings, not just watchlist)
- [ ] 1min / 1hr / 1day / 1week chart time range selector

## Deployment
- [ ] Set up GitHub Actions for CI/CD
- [ ] Deploy backend on Railway
- [ ] Provision PostgreSQL on Railway
- [ ] Update frontend BASE_URL from localhost:8000 to Railway URL
- [ ] Deploy frontend on Railway or Vercel
- [ ] Set environment variables in Railway dashboard
- [ ] Set up custom domain (optional)

## Documentation
- [x] README.md — project overview, setup, architecture
- [ ] Add inline code comments to price_fetcher.py and alert_checker.py
- [ ] Document the prediction engine once built
