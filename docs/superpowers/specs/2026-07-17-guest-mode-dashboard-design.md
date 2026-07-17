# Guest Mode + Finova-style Dashboard — Design

**Date:** 2026-07-17
**Project:** MarketPulse
**Status:** Approved for planning

## Goal

Let anyone demo the dashboard without an account ("Continue as guest"), seeing
all real data from the database. Guests can browse assets, prices, and charts,
but cannot build a watchlist or set alerts — those panels show a locked preview,
and any attempt to interact routes them to the existing signup page.

Simultaneously, restyle the dashboard toward the Finova reference
(`Downloads/modelwebsitebuild.png`) — a top nav + card-grid layout — while
keeping MarketPulse's existing dark theme and CSS-variable theming.

## Scope decisions (from brainstorming)

- **Reference fidelity:** Borrow Finova's *layout and visual style only*, filled
  with MarketPulse's real data. Do NOT reproduce Finova's portfolio total,
  multi-currency cards, transactions, or members — the backend has no data for
  those.
- **Guest panels:** Watchlist and Alerts render as a **locked preview** — a
  placeholder row with a soft lock overlay and a sign-up CTA.
- **Layout frame:** **Top nav + card grid** (no left sidebar). Reuses the
  existing `.nav`.
- **Gating destination:** The existing auth page (`#auth-view`) in **signup**
  mode. Not a modal.

## Architecture

### 1. Backend — new public endpoint

`GET /assets/summary` in `backend/routers/assets.py`. Public (no auth), consistent
with the other `/assets/*` routes.

Returns a JSON array, one object per asset:

```json
{
  "symbol": "BTC",
  "name": "Bitcoin",
  "asset_type": "crypto",
  "price_usd": 64210.55,
  "change_pct_24h": 2.31,
  "volume_24h": 18453000000.0,
  "fetched_at": "2026-07-17T14:05:00Z"
}
```

Computation per asset:
- **price_usd / fetched_at / volume_24h:** the most recent `price_history` row.
- **change_pct_24h:** `(latest - ref) / ref * 100`, where `ref` is the price of
  the `price_history` row closest to 24 hours before `latest.fetched_at`. If
  fewer than two rows exist in that window, `change_pct_24h` is `null`.
- **Assets with no price rows** (e.g. the currently-broken stocks GOOGL / MSFT /
  NVDA — see `TODO.md`): `price_usd`, `change_pct_24h`, `volume_24h`,
  `fetched_at` are all `null`. They still appear in the list (so the "Assets
  tracked" count is honest) but are excluded from gainer/loser/most-active
  ranking on the frontend.

This single call feeds the stat cards, the Top Assets list, and the guest
watchlist preview — avoiding a per-asset fan-out of `/assets/{symbol}/prices`.

### 2. Frontend — session model

Today: two states, keyed on `authToken !== null`.

New: three states.
- **authed** — has a token; full functionality.
- **guest** — no token; demo mode; public data only.
- **unauthed** — on the auth gate; no app rendered.

`api.ts`:
- Add `let guest = false;` plus `enterGuestMode()` / `clearGuestMode()` (or a
  single setter). `isGuest()` accessor.
- Add `getAssetSummary(): Promise<AssetSummary[]>` calling `/assets/summary`.
- `logout()` clears both token and guest flag.

`main.ts`:
- New `enterGuest()` mirrors `enterApp()` but: loads assets + summary + chart
  only; does NOT call `renderWatchlist()` / `renderAlerts()` against the API —
  instead renders the **locked preview** for both panels.
- `enterApp()` (authed) additionally renders the new stat cards + Top Assets list
  from the summary, alongside the real watchlist/alerts.
- Both paths share a `renderOverview()` that draws stat cards + Top Assets from
  the summary.

### 3. Auth page

Add a **"Continue as guest →"** button beneath the existing sign-in form
(`#auth-card`, after `.auth-switch`). Wired to `enterGuest()`.

### 4. Dashboard layout (top nav + card grid)

Within `#app-view`, below the existing `.nav`:

1. **Stat-card row** — 4 Finova-style cards:
   - **Top gainer (24h)** — asset with highest `change_pct_24h`; shows symbol,
     price, green delta.
   - **Top loser (24h)** — lowest `change_pct_24h`; red delta.
   - **Most active** — highest `volume_24h`; shows volume.
   - **Assets tracked** — count of assets.
   Assets with `null` metrics are skipped for gainer/loser/most-active. If no
   asset has a computable change (cold DB), the gainer/loser cards show an
   em-dash placeholder rather than erroring.
2. **Chart + Top Assets** — a two-column region:
   - Left (wide): the existing price chart panel (`.panel--chart`), unchanged
     logic.
   - Right: new **Top Assets** list — every asset with price and % change;
     clicking a row calls `selectAsset(symbol)` to chart it (same interaction as
     watchlist rows).
3. **Watchlist + Alerts row** — the two existing panels, side by side.

### 5. Guest gating

- For a guest, the Watchlist and Alerts panels render a **locked preview**: a
  single muted placeholder row, a soft overlay with a lock glyph, and a CTA
  button — "Sign up to build your watchlist" / "Sign up to set alerts".
- Clicking any locked CTA → `showAuth()` + `setAuthMode("signup")`.
- The add-forms are hidden for guests (consistent with existing
  `syncFormVisibility()`), so there is no inert-form submit path; the locked
  overlay CTA is the only guest entry point into gating.
- Nav for a guest: swap the sign-out icon button (`#logout-btn`) for a
  **"Create account"** button that routes to the signup page. The avatar shows a
  generic guest state. For authed users the nav is unchanged.
- After a guest signs up or logs in from the gate, `enterApp()` runs in authed
  mode and the watchlist/alerts panels load real data.

### 6. Theming

All new markup uses the existing design tokens in `style.css` (`--surface`,
`--surface-2`, `--border`, `--accent`, `--muted`, `--text`, up/down colors).
Dark remains the default (`data-theme="dark"`), and the existing theme toggle
must keep working across the new cards. No new hard-coded colors.

## Components / boundaries

- **`routers/assets.py`** — owns `/assets/summary`; pure read, no auth. Testable
  independently by hitting the endpoint against a seeded DB.
- **`api.ts`** — owns transport + session flags; exposes `getAssetSummary`,
  `isGuest`, guest setters. No DOM.
- **`main.ts`** — owns view state and rendering: `enterGuest`, `renderOverview`
  (stat cards + top assets), locked-preview renderers, guest-aware nav. Depends
  on `api.ts`.
- **`index.html` / `style.css`** — new static markup for the stat-card row, Top
  Assets panel, locked-preview overlay, guest nav button, and the guest CTA on
  the auth card.

## Error handling

- `/assets/summary` fails → overview region shows an inline error, chart still
  attempts to load; app does not white-screen.
- Empty/cold DB → stat cards show placeholders, Top Assets shows an empty state,
  no exceptions.
- Guest never calls protected endpoints, so no 401 handling is needed on the
  guest path.

## Testing / verification

- Backend: hit `GET /assets/summary` against the seeded DB; confirm shape,
  null-handling for price-less stocks, and a sane `change_pct_24h`.
- Frontend build: `npm run build` compiles with no TS errors.
- Drive in browser (backend + frontend running):
  - **Guest path:** "Continue as guest" → dashboard renders with stat cards,
    chart, Top Assets; watchlist/alerts show locked previews; clicking a CTA and
    the nav "Create account" both land on the signup page.
  - **Authed path:** sign up / log in → stat cards + Top Assets render *and*
    real watchlist/alerts load; add-forms work.
  - Theme toggle flips all new cards correctly in both modes.

## Out of scope

- Token persistence across refresh (still in `TODO.md`; a guest refresh returns
  to the gate, same as authed today).
- The broken stock data source (separate `TODO.md` item); this design only
  displays whatever prices exist and degrades gracefully for empty ones.
- Chart time-range selector (separate v2 feature).
