# MarketPulse — TODO / Needed Changes

## Security (must do before deployment)
- [ ] Replace sequential integer IDs with UUIDs on all tables (prevents IDOR attacks)
- [ ] Add rate limiting with `slowapi` on auth and API endpoints
- [ ] Add CORS restrictions so only the frontend domain can call the API
- [ ] Fix token persistence — currently resets on page refresh (use httpOnly cookies or sessionStorage)
- [ ] Add email verification on signup
- [ ] Add password reset flow

## Backend
- [ ] Change scheduler interval from 10 minutes to 1 minute for more accurate price data
- [ ] Add data retention policy — auto-delete price_history rows older than 90 days
- [ ] Add `slowapi` rate limiting (max requests per IP per minute)
- [ ] Move `get_db` dependency to `dependencies.py` and remove duplicates in routers

## Frontend
- [ ] Redesign with proper UI — component library or better CSS
- [ ] Replace auth modal with a dedicated login/signup page
- [ ] Show asset name instead of "Asset ID #5" in alerts panel
- [ ] Show logged-in username in nav
- [ ] Hide watchlist/alerts add forms when not logged in
- [ ] Mobile responsive improvements
- [ ] Add loading states while API calls are in progress
- [ ] Better error messages (e.g. "Asset not found" shown in UI, not browser alert)
- [ ] Light mode polish

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
