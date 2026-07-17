# Guest Mode + Finova-style Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Continue as guest" demo mode and restyle the dashboard into a Finova-style top-nav + card-grid layout, keeping MarketPulse's dark theme.

**Architecture:** One new public backend endpoint (`GET /assets/summary`) supplies per-asset latest price, 24h change, and volume. The frontend gains a third session state (guest) that renders the dashboard from public data only; the watchlist and alerts panels become locked previews that route guests to the existing signup page.

**Tech Stack:** FastAPI + SQLAlchemy (Python) backend, vanilla TypeScript (compiled by `tsc`) + Chart.js frontend, CSS variables for theming.

## Global Constraints

- Backend endpoints under `/assets/*` are **public** (no `get_current_user` dependency). Keep it that way for `/assets/summary`.
- Frontend has **no test runner and no framework**. Frontend tasks are verified by `npm run build` (tsc) compiling cleanly, plus the browser drive in the final task. Do NOT add a JS/TS test framework.
- All new UI must use existing CSS variables only (`--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--muted`, `--accent`, `--accent-soft`, `--accent-ink`, `--loss`, `--loss-soft`, `--radius`, `--radius-sm`, `--shadow`, `--font-display`, `--font-body`, `--font-data`). No new hard-coded colors. Dark (`data-theme="dark"`) stays the default.
- Guests must NEVER call `/watchlist/` or `/alerts/` (they 401 without a token).
- `change_pct_24h` is `null` unless a price row at least 24h older than the latest exists. Frontend shows an em-dash / "Not enough data" fallback for null.
- Use `textContent` (not `innerHTML`) for any asset-derived strings, matching the existing code style.

---

## File Structure

- **Create** `backend/tests/test_summary.py` — pytest coverage for the summary endpoint (SQLite in-memory, dependency override).
- **Modify** `backend/routers/assets.py` — add `GET /summary`.
- **Modify** `backend/requirements.txt` — add `pytest`, `httpx` (TestClient dependency).
- **Modify** `frontend/src/api.ts` — `AssetSummary` type, `getAssetSummary()`, guest session flags.
- **Modify** `frontend/index.html` — guest button on auth card, nav signup button, stat-card row, overview-row wrapper + Top Assets panel.
- **Modify** `frontend/style.css` — stat cards, overview row, top-asset delta, locked previews, auth guest option, nav CTA, responsive rules.
- **Modify** `frontend/src/main.ts` — `enterGuest()`, `renderOverview()`, locked panels, guest-aware nav, gating wiring.

---

### Task 1: Backend `/assets/summary` endpoint

**Files:**
- Modify: `backend/routers/assets.py`
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_summary.py` (create)

**Interfaces:**
- Consumes: `Asset`, `PriceHistory` from `models`; `get_db` from `database`.
- Produces: `GET /assets/summary` → JSON array of objects with keys `symbol` (str), `name` (str), `asset_type` (str), `price_usd` (float|null), `change_pct_24h` (float|null), `volume_24h` (float|null), `fetched_at` (datetime ISO string|null). The frontend `AssetSummary` type (Task 2) mirrors these keys exactly.

- [ ] **Step 1: Add test dependencies to requirements**

Append these two lines to `backend/requirements.txt`:

```
pytest
httpx
```

Then install into the existing venv:

Run: `cd backend && ./venv/Scripts/python -m pip install pytest httpx`
Expected: installs successfully (or "already satisfied").

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_summary.py`:

```python
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from models import Asset, PriceHistory
from routers import assets


@pytest.fixture
def client():
    # In-memory SQLite with StaticPool so every connection shares one DB.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    now = datetime(2026, 7, 17, 12, 0, 0)
    db = TestingSessionLocal()
    # BTC: a row now and a row 25h ago -> change computable (+10%).
    db.add(Asset(id=1, symbol="BTC", name="Bitcoin", asset_type="crypto"))
    db.add(PriceHistory(asset_id=1, price_usd=100.0, volume_24h=1000.0, fetched_at=now - timedelta(hours=25)))
    db.add(PriceHistory(asset_id=1, price_usd=110.0, volume_24h=2000.0, fetched_at=now))
    # ETH: only recent rows (<24h apart) -> price present, change null.
    db.add(Asset(id=2, symbol="ETH", name="Ethereum", asset_type="crypto"))
    db.add(PriceHistory(asset_id=2, price_usd=50.0, volume_24h=500.0, fetched_at=now - timedelta(hours=2)))
    db.add(PriceHistory(asset_id=2, price_usd=55.0, volume_24h=600.0, fetched_at=now))
    # GOOGL: no price rows -> all metrics null.
    db.add(Asset(id=3, symbol="GOOGL", name="Alphabet", asset_type="stock"))
    db.commit()
    db.close()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app = FastAPI()
    app.include_router(assets.router, prefix="/assets")
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _by_symbol(rows):
    return {row["symbol"]: row for row in rows}


def test_summary_returns_every_asset(client):
    response = client.get("/assets/summary")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 3
    assert set(_by_symbol(rows).keys()) == {"BTC", "ETH", "GOOGL"}


def test_summary_computes_24h_change(client):
    btc = _by_symbol(client.get("/assets/summary").json())["BTC"]
    assert btc["price_usd"] == 110.0
    assert btc["volume_24h"] == 2000.0
    assert btc["change_pct_24h"] == pytest.approx(10.0)


def test_summary_null_change_without_24h_reference(client):
    eth = _by_symbol(client.get("/assets/summary").json())["ETH"]
    assert eth["price_usd"] == 55.0
    assert eth["change_pct_24h"] is None


def test_summary_null_metrics_when_no_prices(client):
    googl = _by_symbol(client.get("/assets/summary").json())["GOOGL"]
    assert googl["price_usd"] is None
    assert googl["change_pct_24h"] is None
    assert googl["volume_24h"] is None
    assert googl["fetched_at"] is None
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && ./venv/Scripts/python -m pytest tests/test_summary.py -v`
Expected: FAIL — all four tests error/fail with 404 (route `/assets/summary` not found yet).

- [ ] **Step 4: Implement the endpoint**

Edit `backend/routers/assets.py`. Change the import line and add the new route. The full file becomes:

```python
from datetime import timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Asset, PriceHistory

router = APIRouter()
@router.get("/")
def get_assets(db: Session = Depends(get_db)):
    assets = db.query(Asset).all()
    return assets

@router.get("/summary")
def get_asset_summary(db: Session = Depends(get_db)):
    assets = db.query(Asset).order_by(Asset.id).all()
    result = []
    for asset in assets:
        rows = (
            db.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset.id)
            .order_by(PriceHistory.fetched_at.desc())
            .all()
        )
        if not rows:
            result.append({
                "symbol": asset.symbol,
                "name": asset.name,
                "asset_type": asset.asset_type,
                "price_usd": None,
                "change_pct_24h": None,
                "volume_24h": None,
                "fetched_at": None,
            })
            continue

        latest = rows[0]
        change_pct = None
        cutoff = latest.fetched_at - timedelta(hours=24)
        # rows are newest-first; the first row at/older than the cutoff is the
        # closest one to 24h ago. No such row -> not enough history -> null.
        reference = next((row for row in rows if row.fetched_at <= cutoff), None)
        if reference is not None and reference.price_usd:
            change_pct = (latest.price_usd - reference.price_usd) / reference.price_usd * 100

        result.append({
            "symbol": asset.symbol,
            "name": asset.name,
            "asset_type": asset.asset_type,
            "price_usd": latest.price_usd,
            "change_pct_24h": change_pct,
            "volume_24h": latest.volume_24h,
            "fetched_at": latest.fetched_at,
        })
    return result

@router.get("/{symbol}/prices")
def get_prices(symbol: str, limit: int = 48, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.symbol == symbol.upper()).first()

    if not asset:
        return {"error": "Asset not found"}

    prices = (
        db.query(PriceHistory)
        .filter(PriceHistory.asset_id == asset.id)
        .order_by(PriceHistory.fetched_at.desc())
        .limit(limit)
        .all()
    )
    return prices
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && ./venv/Scripts/python -m pytest tests/test_summary.py -v`
Expected: PASS — 4 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/assets.py backend/requirements.txt backend/tests/test_summary.py
git commit -m "feat(backend): add public /assets/summary endpoint"
```

---

### Task 2: Frontend API — summary type and guest session flags

**Files:**
- Modify: `frontend/src/api.ts`

**Interfaces:**
- Consumes: existing `request<T>()`, module-level `authToken`.
- Produces:
  - `interface AssetSummary { symbol: string; name: string; asset_type: string; price_usd: number | null; change_pct_24h: number | null; volume_24h: number | null; fetched_at: string | null; }`
  - `getAssetSummary(): Promise<AssetSummary[]>`
  - `enterGuestMode(): void` (sets guest flag true, clears token)
  - `isGuest(): boolean`
  - `logout()` and `login()`/`signup()` also clear the guest flag.

- [ ] **Step 1: Add the AssetSummary interface**

In `frontend/src/api.ts`, after the existing `PricePoint` interface (around line 44), add:

```typescript
export interface AssetSummary {
    symbol: string;
    name: string;
    asset_type: string;
    price_usd: number | null;
    change_pct_24h: number | null;
    volume_24h: number | null;
    fetched_at: string | null;
}
```

- [ ] **Step 2: Add the guest flag next to the token**

Change the token declaration near the top of `frontend/src/api.ts`:

```typescript
let authToken: string | null = null;
let guest = false;
```

- [ ] **Step 3: Clear the guest flag on login/signup/logout**

Update `signup`, `login`, and `logout` in `frontend/src/api.ts` so authenticating always leaves guest mode:

```typescript
export async function signup(email: string, password: string): Promise<void> {
    const data = await request<{ token: string }>("/auth/signup", jsonPost({ email, password }));
    authToken = data.token;
    guest = false;
}

export async function login(email: string, password: string): Promise<void> {
    const data = await request<{ token: string }>("/auth/login", jsonPost({ email, password }));
    authToken = data.token;
    guest = false;
}

export function logout(): void {
    authToken = null;
    guest = false;
}
```

- [ ] **Step 4: Add guest accessors and the summary call**

After `isLoggedIn()` in `frontend/src/api.ts`, add:

```typescript
export function enterGuestMode(): void {
    guest = true;
    authToken = null;
}

export function isGuest(): boolean {
    return guest;
}

export function getAssetSummary(): Promise<AssetSummary[]> {
    return request<AssetSummary[]>("/assets/summary");
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd frontend && npm run build`
Expected: exits 0, no TS errors. (`main.ts` does not yet use the new exports; unused exports are fine.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api.ts frontend/dist
git commit -m "feat(frontend): add AssetSummary type and guest session flags to api"
```

---

### Task 3: Frontend markup and styles

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/style.css`

**Interfaces:**
- Produces these DOM ids/classes that `main.ts` (Task 4) targets: `#guest-btn`, `#nav-signup`, `#stat-row`, `#top-assets`, plus classes `.stat-card`, `.stat-card__label`, `.stat-card__value`, `.stat-card__sub`, `.stat-card__delta`, `.asset-row--quote`, `.asset-row__delta`, `.locked`, `.locked__ghosts`, `.locked__cta`.

- [ ] **Step 1: Add the "Continue as guest" button to the auth card**

In `frontend/index.html`, the auth card currently ends with the `.auth-switch` paragraph (lines 84-87). Immediately after that closing `</p>` and before the `</div>` that closes `.auth-card`, insert:

```html
            <div class="auth-guest">
                <span class="auth-guest__divider">or</span>
                <button type="button" class="btn btn-ghost btn-block" id="guest-btn">Continue as guest →</button>
            </div>
```

- [ ] **Step 2: Add the nav signup button**

In `frontend/index.html`, inside `.nav__actions`, add a hidden signup button immediately before the `#logout-btn` button (line 112):

```html
            <button type="button" class="btn btn-primary" id="nav-signup" hidden>Create account</button>
```

- [ ] **Step 3: Add the stat-card row and wrap the chart with the Top Assets panel**

In `frontend/index.html`, replace the opening of `<main class="dashboard">` and the chart `<section>` so the structure becomes a stat row, then an overview row holding the chart and a new Top Assets panel. Change this (line 128-129):

```html
    <main class="dashboard">
        <section class="panel panel--chart">
```

to:

```html
    <main class="dashboard">
        <section class="stat-row" id="stat-row"></section>

        <div class="overview-row">
        <section class="panel panel--chart">
```

Then find the closing `</section>` of the chart panel (line 155, immediately before `<section class="panel">` for the watchlist) and change this:

```html
        </section>

        <section class="panel">
            <div class="panel__head">
                <h2 class="panel__title">Watchlist</h2>
```

to:

```html
        </section>

        <section class="panel panel--top">
            <div class="panel__head">
                <h2 class="panel__title">Top Assets</h2>
            </div>
            <div id="top-assets" class="asset-list"></div>
        </section>
        </div>

        <section class="panel">
            <div class="panel__head">
                <h2 class="panel__title">Watchlist</h2>
```

- [ ] **Step 4: Remove the full-width span on the chart panel**

In `frontend/style.css`, the chart panel now lives inside `.overview-row` (its own 2-column grid), so its full-width span must go. Change line 309:

```css
.panel--chart { grid-column: 1 / -1; }
```

to:

```css
.panel--chart { grid-column: auto; }
```

- [ ] **Step 5: Append the new component styles**

Add to the end of `frontend/style.css` (before the responsive `@media` blocks is not required; appending at the very end is fine because the media queries below re-declare the grid columns):

```css
/* ---------- Stat cards ---------- */

.stat-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
}

.stat-card {
    display: grid;
    gap: 4px;
    align-content: start;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 18px;
}
.stat-card__label { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.stat-card__value { font-family: var(--font-display); font-weight: 700; font-size: 24px; letter-spacing: -0.02em; }
.stat-card__sub { font-family: var(--font-data); font-size: 13px; color: var(--muted); }
.stat-card__delta { font-family: var(--font-data); font-size: 14px; font-weight: 500; margin-top: 2px; }

/* ---------- Overview row (chart + top assets) ---------- */

.overview-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 20px;
    align-items: start;
}

.asset-row--quote { cursor: pointer; }
.asset-row__delta { font-family: var(--font-data); font-size: 14px; text-align: right; white-space: nowrap; }

/* ---------- Locked (guest) panels ---------- */

.locked { position: relative; min-height: 200px; }
.locked__ghosts { display: grid; gap: 8px; filter: blur(2px); opacity: 0.45; pointer-events: none; }
.locked__cta {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
    padding: 16px;
}
.locked__cta svg { width: 26px; height: 26px; color: var(--accent); }
.locked__cta p { margin: 0; color: var(--muted); font-size: 14px; max-width: 26ch; }

/* ---------- Auth guest option ---------- */

.auth-guest { margin-top: 18px; display: grid; gap: 12px; }
.auth-guest__divider {
    position: relative;
    text-align: center;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
}
.auth-guest__divider::before,
.auth-guest__divider::after {
    content: "";
    position: absolute;
    top: 50%;
    width: 40%;
    height: 1px;
    background: var(--border);
}
.auth-guest__divider::before { left: 0; }
.auth-guest__divider::after { right: 0; }

/* ---------- Nav CTA ---------- */

#nav-signup { min-height: 40px; padding: 0 14px; }

/* ---------- Dashboard responsive additions ---------- */

@media (max-width: 900px) {
    .stat-row { grid-template-columns: repeat(2, 1fr); }
    .overview-row { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
    .stat-row { grid-template-columns: 1fr; }
}
```

- [ ] **Step 6: Verify the frontend still builds and the page loads**

Run: `cd frontend && npm run build`
Expected: exits 0. (No TS changed, but confirms nothing broke.)

- [ ] **Step 7: Commit**

```bash
git add frontend/index.html frontend/style.css
git commit -m "feat(frontend): stat cards, top-assets panel, locked previews, guest button markup"
```

---

### Task 4: Frontend behavior — guest mode, overview rendering, gating

**Files:**
- Modify: `frontend/src/main.ts`

**Interfaces:**
- Consumes from Task 2: `AssetSummary`, `getAssetSummary`, `enterGuestMode`, `isGuest`. Consumes from Task 3: ids `#guest-btn`, `#nav-signup`, `#stat-row`, `#top-assets`.
- Consumes existing `main.ts` helpers: `el`, `formatPrice`, `skeletons`, `selectAsset`, `populateAssetSelectors`, `showApp`, `showAuth`, `setAuthMode`, `syncFormVisibility`, `toast`, `messageFor`, module vars `assets`, `chartedSymbol`.
- Produces: `enterGuest()`, `renderOverview()`, guest-aware nav — wired in `init()`.

- [ ] **Step 1: Import the new API members**

In `frontend/src/main.ts`, extend the import block from `./api.js` (lines 1-18) to include the new members. Add these to the import list:

```typescript
    getAssetSummary,
    enterGuestMode,
    isGuest,
    type AssetSummary,
```

- [ ] **Step 2: Add the summary module state**

After `let assets: Asset[] = [];` (line 26), add:

```typescript
let summary: AssetSummary[] = [];
```

- [ ] **Step 3: Add compact number and percent formatters**

After the `formatPrice` function (line 42), add:

```typescript
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function formatPct(value: number | null | undefined): string {
    if (typeof value !== "number") return "—";
    const sign = value >= 0 ? "+" : "−";
    return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function formatVolume(value: number | null | undefined): string {
    return typeof value === "number" ? `$${compact.format(value)}` : "—";
}
```

- [ ] **Step 4: Add nav sync and signup prompt**

After the `showAuth()` function (around line 101), add:

```typescript
function syncNav(): void {
    const guestNow = isGuest();
    el("logout-btn").hidden = guestNow;
    el("nav-signup").hidden = !guestNow;
}

function promptSignup(): void {
    showAuth();
    setAuthMode("signup");
}
```

- [ ] **Step 5: Add overview rendering (stat cards + top assets)**

Add these functions (place them just before the `/* ---------- Chart + quote ---------- */` section, around line 434):

```typescript
/* ---------- Overview: stat cards + top assets ---------- */

function makeStatCard(
    label: string,
    value: string,
    sub: string,
    delta: { text: string; tone: "up" | "down" } | null
): HTMLElement {
    const card = document.createElement("article");
    card.className = "stat-card";

    const labelEl = document.createElement("span");
    labelEl.className = "stat-card__label";
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.className = "stat-card__value";
    valueEl.textContent = value;

    const subEl = document.createElement("span");
    subEl.className = "stat-card__sub";
    subEl.textContent = sub;

    card.append(labelEl, valueEl, subEl);

    if (delta) {
        const deltaEl = document.createElement("span");
        deltaEl.className = `stat-card__delta ${delta.tone}`;
        deltaEl.textContent = delta.text;
        card.append(deltaEl);
    }
    return card;
}

function deltaFor(item: AssetSummary): { text: string; tone: "up" | "down" } {
    const up = (item.change_pct_24h ?? 0) >= 0;
    return { text: formatPct(item.change_pct_24h), tone: up ? "up" : "down" };
}

function renderStatCards(): void {
    const row = el("stat-row");
    row.innerHTML = "";

    const withChange = summary.filter((item) => typeof item.change_pct_24h === "number");
    const withVolume = summary.filter((item) => typeof item.volume_24h === "number");

    const gainer = withChange.reduce<AssetSummary | null>(
        (best, item) => (!best || (item.change_pct_24h as number) > (best.change_pct_24h as number) ? item : best),
        null
    );
    const loser = withChange.reduce<AssetSummary | null>(
        (worst, item) => (!worst || (item.change_pct_24h as number) < (worst.change_pct_24h as number) ? item : worst),
        null
    );
    const active = withVolume.reduce<AssetSummary | null>(
        (top, item) => (!top || (item.volume_24h as number) > (top.volume_24h as number) ? item : top),
        null
    );

    row.append(
        gainer
            ? makeStatCard("Top gainer · 24h", gainer.symbol, formatPrice(gainer.price_usd), deltaFor(gainer))
            : makeStatCard("Top gainer · 24h", "—", "Not enough data", null),
        loser
            ? makeStatCard("Top loser · 24h", loser.symbol, formatPrice(loser.price_usd), deltaFor(loser))
            : makeStatCard("Top loser · 24h", "—", "Not enough data", null),
        active
            ? makeStatCard("Most active", active.symbol, formatVolume(active.volume_24h), null)
            : makeStatCard("Most active", "—", "Not enough data", null),
        makeStatCard("Assets tracked", String(summary.length), "in the market", null)
    );
}

function renderTopAssets(): void {
    const container = el("top-assets");
    container.innerHTML = "";

    if (summary.length === 0) {
        container.innerHTML = `<div class="empty"><strong>No assets</strong>Nothing to show yet.</div>`;
        return;
    }

    // Biggest 24h movers first; assets without a change sink to the bottom.
    const ordered = [...summary].sort(
        (a, b) => (b.change_pct_24h ?? -Infinity) - (a.change_pct_24h ?? -Infinity)
    );

    for (const item of ordered) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "asset-row asset-row--quote";
        row.setAttribute("aria-current", String(item.symbol === chartedSymbol));

        const id = document.createElement("span");
        id.className = "asset-row__id";
        const sym = document.createElement("span");
        sym.className = "asset-row__sym";
        sym.textContent = item.symbol;
        const name = document.createElement("span");
        name.className = "asset-row__name";
        name.textContent = item.name;
        id.append(sym, name);

        const price = document.createElement("span");
        price.className = "asset-row__price";
        price.textContent = formatPrice(item.price_usd);

        const delta = document.createElement("span");
        const tone = typeof item.change_pct_24h === "number" ? (item.change_pct_24h >= 0 ? "up" : "down") : "";
        delta.className = `asset-row__delta ${tone}`;
        delta.textContent = formatPct(item.change_pct_24h);

        row.append(id, price, delta);
        row.addEventListener("click", () => void selectAsset(item.symbol));
        container.append(row);
    }
}

function renderOverview(): void {
    renderStatCards();
    renderTopAssets();
}
```

- [ ] **Step 6: Add locked guest panels**

Add these functions after `renderOverview` (still before the chart section):

```typescript
/* ---------- Guest locked panels ---------- */

function lockedPanel(container: HTMLElement, message: string, cta: string): void {
    container.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "locked";

    const ghosts = document.createElement("div");
    ghosts.className = "locked__ghosts";
    ghosts.setAttribute("aria-hidden", "true");
    ghosts.innerHTML = skeletons(3);

    const overlay = document.createElement("div");
    overlay.className = "locked__cta";
    overlay.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>`;

    const text = document.createElement("p");
    text.textContent = message;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary";
    button.textContent = cta;
    button.addEventListener("click", promptSignup);

    overlay.append(text, button);
    wrap.append(ghosts, overlay);
    container.append(wrap);
}

function renderGuestPanels(): void {
    el("watchlist-count").textContent = "";
    el("alerts-count").textContent = "";
    lockedPanel(
        el("watchlist-cards"),
        "Create a free account to build your own watchlist.",
        "Sign up to build your watchlist"
    );
    lockedPanel(
        el("alerts-list"),
        "Create a free account to set price alerts.",
        "Sign up to set alerts"
    );
}
```

- [ ] **Step 7: Add `enterGuest()` and load the overview in `enterApp()`**

Replace the existing `enterApp()` function (lines 608-625) with the two functions below:

```typescript
async function enterApp(): Promise<void> {
    showApp();
    syncNav();
    syncFormVisibility();

    try {
        [assets, summary] = await Promise.all([getAssets(), getAssetSummary()]);
        populateAssetSelectors();
        renderOverview();
    } catch (error) {
        toast(messageFor(error), "error");
    }

    const first = assets[0]?.symbol;
    await Promise.all([
        renderWatchlist(),
        renderAlerts(),
        first ? selectAsset(first) : Promise.resolve(),
    ]);
}

async function enterGuest(): Promise<void> {
    enterGuestMode();
    showApp();
    syncNav();
    syncFormVisibility();

    try {
        [assets, summary] = await Promise.all([getAssets(), getAssetSummary()]);
        populateAssetSelectors();
        renderOverview();
    } catch (error) {
        toast(messageFor(error), "error");
    }

    renderGuestPanels();

    const first = assets[0]?.symbol;
    if (first) await selectAsset(first);
}
```

- [ ] **Step 8: Reset summary on logout**

In `handleLogout()` (lines 627-643), after `assets = [];` add:

```typescript
    summary = [];
```

- [ ] **Step 9: Wire the guest and nav-signup buttons in `init()`**

In `init()` (around line 653, after the `auth-switch-btn` listener), add:

```typescript
    el("guest-btn").addEventListener("click", () => void enterGuest());
    el("nav-signup").addEventListener("click", promptSignup);
```

- [ ] **Step 10: Build and verify it compiles**

Run: `cd frontend && npm run build`
Expected: exits 0, no TS errors.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/main.ts frontend/dist
git commit -m "feat(frontend): guest mode, overview cards, top assets, and signup gating"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the backend test suite**

Run: `cd backend && ./venv/Scripts/python -m pytest -v`
Expected: PASS — the summary tests pass.

- [ ] **Step 2: Build the frontend**

Run: `cd frontend && npm run build`
Expected: exits 0.

- [ ] **Step 3: Start the backend (serves the frontend too)**

Run: `cd backend && ./venv/Scripts/uvicorn main:app --reload`
Expected: Uvicorn running on http://127.0.0.1:8000. (Requires the real Postgres DB + `.env`.)

- [ ] **Step 4: Verify the endpoint directly**

Run: `curl -s http://localhost:8000/assets/summary`
Expected: a JSON array; crypto assets have numeric `price_usd`; the broken stocks (GOOGL/MSFT/NVDA) have `null` price and change.

- [ ] **Step 5: Drive the guest path in a browser**

Open `http://localhost:8000`, then confirm:
- The auth page shows a "Continue as guest →" button.
- Clicking it opens the dashboard: stat-card row (gainer/loser/most-active/count), price chart, Top Assets list.
- Watchlist and Alerts panels show the blurred locked preview with a "Sign up…" CTA; the add-forms are hidden.
- Clicking a locked CTA returns to the auth page in **signup** mode.
- Back in guest mode, the nav shows a "Create account" button (no sign-out icon); clicking it returns to the signup page.
- Toggle theme — all new cards restyle correctly in light and dark.

- [ ] **Step 6: Drive the authed path**

From the auth page, create an account or log in, then confirm:
- The dashboard shows the same stat cards + Top Assets, **and** the real Watchlist/Alerts panels with working add-forms.
- The nav shows the sign-out icon (no "Create account" button).
- Adding a ticker and creating an alert still work.
- Signing out returns to the auth page.

- [ ] **Step 7: Final commit (if any doc/dist updates remain)**

```bash
git add -A
git commit -m "chore: verify guest mode + dashboard end-to-end" --allow-empty
```

---

## Self-Review Notes

- **Spec coverage:** backend summary endpoint (Task 1) ✓; session model + guest flags (Task 2) ✓; auth-page guest button (Task 3/4) ✓; stat cards, chart+top-assets, watchlist/alerts row (Task 3/4) ✓; locked previews + gating to signup (Task 4) ✓; theming via variables (Task 3) ✓; verification incl. both paths (Task 5) ✓.
- **Null handling:** stat cards and Top Assets fall back to em-dash / "Not enough data"; endpoint returns nulls for price-less assets — covered by tests in Task 1.
- **Type consistency:** `AssetSummary` keys in Task 2 match the endpoint JSON keys in Task 1 exactly; `renderOverview`/`enterGuest`/`enterApp`/`renderGuestPanels` names are consistent across Task 4 steps.
