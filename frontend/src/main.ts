import {
    ApiError,
    addToWatchlist,
    createAlert,
    deleteAlert,
    getAlerts,
    getAssets,
    getAssetSummary,
    getPrices,
    getWatchlist,
    enterGuestMode,
    isGuest,
    isLoggedIn,
    login,
    logout,
    removeFromWatchlist,
    signup,
    type Alert,
    type Asset,
    type AssetSummary,
    type PricePoint,
} from "./api.js";
import { startBackdrop, stopBackdrop } from "./backdrop.js";

type AuthMode = "login" | "signup";

type AssetFilter = "all" | "crypto" | "stock";
type SortKey = "name" | "price" | "change";
type SortDir = "asc" | "desc";

let authMode: AuthMode = "login";
let priceChart: any = null;
let chartedSymbol: string | null = null;
let assets: Asset[] = [];
let summary: AssetSummary[] = [];

// Assets panel view state. Default mirrors the old "top movers" list: biggest
// 24h gainers first.
let assetFilter: AssetFilter = "all";
let assetSort: { key: SortKey; dir: SortDir } = { key: "change", dir: "desc" };

function el<T extends Element = HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing element: #${id}`);
    return node as unknown as T;
}

const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});

function formatPrice(value: number | null | undefined): string {
    return typeof value === "number" ? money.format(value) : "—";
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 } as Intl.NumberFormatOptions);

function formatPct(value: number | null | undefined): string {
    if (typeof value !== "number") return "—";
    const sign = value >= 0 ? "+" : "−";
    return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function formatVolume(value: number | null | undefined): string {
    return typeof value === "number" ? `$${compact.format(value)}` : "—";
}

/* ---------- Toast ---------- */

let toastTimer: number | undefined;

function toast(message: string, tone: "info" | "error" = "info"): void {
    const node = el<HTMLDivElement>("toast");
    node.textContent = message;
    node.dataset.tone = tone;
    node.dataset.visible = "true";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        node.dataset.visible = "false";
    }, 4000);
}

function messageFor(error: unknown): string {
    return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}

/* ---------- Theme ---------- */

const SUN_ICON = `<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />`;
const MOON_ICON = `<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />`;

function applyTheme(theme: "dark" | "light"): void {
    document.documentElement.setAttribute("data-theme", theme);

    // The theme control lives in the account menu and advertises the theme it
    // switches *to*, so in dark mode it offers "Light mode" with a sun icon.
    const icon = el<SVGElement>("menu-theme-icon");
    const label = el<HTMLSpanElement>("menu-theme-label");
    const nextIsLight = theme === "dark";

    label.textContent = nextIsLight ? "Light mode" : "Dark mode";
    icon.innerHTML = nextIsLight ? SUN_ICON : MOON_ICON;

    if (chartedSymbol) void renderChart(chartedSymbol);
}

function currentTheme(): "dark" | "light" {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------- Views ---------- */

function showApp(): void {
    el("auth-view").hidden = true;
    el("app-view").hidden = false;
    stopBackdrop();
}

function showAuth(): void {
    el("auth-view").hidden = false;
    el("app-view").hidden = true;
    startBackdrop(el<HTMLCanvasElement>("auth-backdrop"));
}

function syncNav(): void {
    // The account menu shows account controls (Privacy/Password/Sign out) to
    // members and a "Create account" item to guests.
    const guestNow = isGuest();
    el("menu-member-items").hidden = guestNow;
    el("menu-signup").hidden = !guestNow;
}

/* ---------- Account menu ---------- */

function setAccountMenu(open: boolean): void {
    el("account-panel").hidden = !open;
    el("account-trigger").setAttribute("aria-expanded", String(open));
}

function toggleAccountMenu(): void {
    // Open when currently hidden. Coerce because the DOM `hidden` type widened
    // to `boolean | "until-found"`.
    setAccountMenu(Boolean(el("account-panel").hidden));
}

function promptSignup(): void {
    showAuth();
    setAuthMode("signup");
}

/** Add forms are only usable when signed in. The gate normally covers this,
    but the panels stay honest if they ever render unauthenticated. */
function syncFormVisibility(): void {
    const signedIn = isLoggedIn();
    el<HTMLFormElement>("watchlist-form").hidden = !signedIn;
    el<HTMLFormElement>("alert-form").hidden = !signedIn;
}

/* ---------- Auth form ---------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

function setFieldError(inputId: string, errorId: string, message: string): void {
    const input = el<HTMLInputElement>(inputId);
    el(errorId).textContent = message;
    if (message) {
        input.setAttribute("aria-invalid", "true");
    } else {
        input.removeAttribute("aria-invalid");
    }
}

function clearAuthErrors(): void {
    setFieldError("auth-email", "auth-email-error", "");
    setFieldError("auth-password", "auth-password-error", "");
    setFieldError("auth-confirm", "auth-confirm-error", "");
    const banner = el<HTMLParagraphElement>("auth-error");
    banner.dataset.visible = "false";
    banner.textContent = "";
}

function showAuthError(message: string): void {
    const banner = el<HTMLParagraphElement>("auth-error");
    banner.textContent = message;
    banner.dataset.visible = "true";
}

function setAuthMode(mode: AuthMode): void {
    authMode = mode;
    const signingUp = mode === "signup";

    el("auth-title").textContent = signingUp ? "Create your account" : "Sign in";
    el("auth-sub").textContent = signingUp
        ? "Start tracking ten tickers in about a minute."
        : "Pick up where your watchlist left off.";
    el("auth-submit").textContent = signingUp ? "Create account" : "Sign in";
    el("auth-switch-text").textContent = signingUp ? "Already have an account?" : "New to MarketPulse?";
    el("auth-switch-btn").textContent = signingUp ? "Sign in" : "Create an account";

    el("confirm-field").hidden = !signingUp;
    el("password-hint").hidden = !signingUp;

    // Tells the password manager whether to offer a saved password or to save a new one.
    el<HTMLInputElement>("auth-password").autocomplete = signingUp ? "new-password" : "current-password";

    // Confirm never carries a value across modes: a stale value is invisible on
    // sign-in and would append to whatever gets pasted next.
    const confirm = el<HTMLInputElement>("auth-confirm");
    confirm.required = signingUp;
    confirm.disabled = !signingUp;
    confirm.value = "";

    clearAuthErrors();
}

function validateAuthForm(email: string, password: string, confirm: string): boolean {
    clearAuthErrors();
    let valid = true;

    if (!email) {
        setFieldError("auth-email", "auth-email-error", "Enter your email address");
        valid = false;
    } else if (!EMAIL_PATTERN.test(email)) {
        setFieldError("auth-email", "auth-email-error", "Enter a valid email address, like you@domain.com");
        valid = false;
    }

    if (!password) {
        setFieldError("auth-password", "auth-password-error", "Enter your password");
        valid = false;
    } else if (authMode === "signup" && password.length < 8) {
        setFieldError("auth-password", "auth-password-error", "Use at least 8 characters");
        valid = false;
    }

    if (authMode === "signup") {
        if (!confirm) {
            setFieldError("auth-confirm", "auth-confirm-error", "Re-enter your password");
            valid = false;
        } else if (confirm !== password) {
            setFieldError("auth-confirm", "auth-confirm-error", "Passwords don't match");
            valid = false;
        }
    }

    return valid;
}

async function handleAuthSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const email = el<HTMLInputElement>("auth-email").value.trim();
    const password = el<HTMLInputElement>("auth-password").value;
    const confirm = el<HTMLInputElement>("auth-confirm").value;

    if (!validateAuthForm(email, password, confirm)) return;

    const submit = el<HTMLButtonElement>("auth-submit");
    const label = submit.textContent ?? "";
    submit.disabled = true;
    submit.textContent = authMode === "signup" ? "Creating account…" : "Signing in…";

    try {
        if (authMode === "signup") {
            await signup(email, password);
        } else {
            await login(email, password);
        }
        // Let the browser offer to save the credentials before the form leaves the DOM.
        await enterApp();
    } catch (error) {
        showAuthError(messageFor(error));
    } finally {
        // Always restore the control, including on success: the form is reused
        // after sign-out, and a stuck label is the only symptom a user would see.
        submit.disabled = false;
        submit.textContent = label;
    }
}

/* ---------- Watchlist ---------- */

function skeletons(count: number): string {
    return Array.from({ length: count }, () => `<div class="skeleton"></div>`).join("");
}

async function renderWatchlist(): Promise<void> {
    const container = el<HTMLDivElement>("watchlist-cards");
    const count = el<HTMLSpanElement>("watchlist-count");
    container.innerHTML = skeletons(3);

    let items;
    try {
        items = await getWatchlist();
    } catch (error) {
        container.innerHTML = `<p class="empty"><strong>Couldn't load your watchlist</strong>${messageFor(error)}</p>`;
        count.textContent = "";
        return;
    }

    count.textContent = items.length ? `${items.length}` : "";

    if (items.length === 0) {
        container.innerHTML = `<div class="empty"><strong>No assets yet</strong>Add a ticker below to start tracking it.</div>`;
        return;
    }

    container.innerHTML = "";
    for (const item of items) {
        const row = document.createElement("div");
        row.className = "asset-row";
        row.setAttribute("aria-current", String(item.symbol === chartedSymbol));
        row.innerHTML = `
            <span class="asset-row__id">
                <span class="asset-row__sym"></span>
                <span class="asset-row__name"></span>
            </span>
            <span class="asset-row__price"></span>
        `;
        row.querySelector(".asset-row__sym")!.textContent = item.symbol;
        row.querySelector(".asset-row__name")!.textContent = item.name;
        row.querySelector(".asset-row__price")!.textContent = formatPrice(item.price_usd);

        const chart = document.createElement("button");
        chart.type = "button";
        chart.className = "visually-hidden";
        chart.textContent = `Chart ${item.name}`;
        chart.addEventListener("click", () => void selectAsset(item.symbol));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-btn";
        remove.setAttribute("aria-label", `Remove ${item.name} from watchlist`);
        remove.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>`;
        remove.addEventListener("click", (event) => {
            event.stopPropagation();
            void handleRemoveAsset(item.symbol, item.name);
        });

        row.addEventListener("click", () => void selectAsset(item.symbol));
        row.appendChild(chart);
        row.appendChild(remove);
        container.appendChild(row);
    }
}

async function handleRemoveAsset(symbol: string, name: string): Promise<void> {
    try {
        await removeFromWatchlist(symbol);
        toast(`${name} removed from your watchlist.`);
        await renderWatchlist();
    } catch (error) {
        toast(messageFor(error), "error");
    }
}

async function handleWatchlistSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const input = el<HTMLInputElement>("symbol-input");
    const symbol = input.value.trim().toUpperCase();
    if (!symbol) return;

    const submit = el<HTMLButtonElement>("watchlist-submit");
    submit.disabled = true;
    submit.textContent = "Adding…";

    try {
        await addToWatchlist(symbol);
        input.value = "";
        toast(`${symbol} added to your watchlist.`);
        await renderWatchlist();
    } catch (error) {
        toast(messageFor(error), "error");
    } finally {
        submit.disabled = false;
        submit.textContent = "Add";
    }
}

/* ---------- Alerts ---------- */

function describeAlert(alert: Alert): string {
    const direction = alert.condition === "above" ? "Rises above" : "Falls below";
    return `${direction} ${money.format(alert.target_price)}`;
}

async function renderAlerts(): Promise<void> {
    const container = el<HTMLDivElement>("alerts-list");
    const count = el<HTMLSpanElement>("alerts-count");
    container.innerHTML = skeletons(2);

    let alerts: Alert[];
    try {
        alerts = await getAlerts();
    } catch (error) {
        container.innerHTML = `<p class="empty"><strong>Couldn't load your alerts</strong>${messageFor(error)}</p>`;
        count.textContent = "";
        return;
    }

    count.textContent = alerts.length ? `${alerts.length}` : "";

    if (alerts.length === 0) {
        container.innerHTML = `<div class="empty"><strong>No alerts set</strong>Choose an asset and a target price to get notified.</div>`;
        return;
    }

    container.innerHTML = "";
    for (const alert of alerts) {
        const item = document.createElement("div");
        item.className = `alert-item ${alert.is_triggered ? "triggered" : ""}`;
        item.innerHTML = `
            <span class="alert-item__what">
                <span class="alert-item__asset"></span>
                <span class="alert-item__rule"></span>
            </span>
            <span class="tag"></span>
        `;

        const label = alert.name ?? alert.symbol ?? "Unknown asset";
        item.querySelector(".alert-item__asset")!.textContent = label;
        item.querySelector(".alert-item__rule")!.textContent = describeAlert(alert);

        const tag = item.querySelector(".tag") as HTMLSpanElement;
        tag.textContent = alert.is_triggered ? "Triggered" : "Watching";
        if (alert.is_triggered) tag.classList.add("tag--live");

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-btn";
        remove.setAttribute("aria-label", `Delete alert for ${label}`);
        remove.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>`;
        remove.addEventListener("click", () => void handleRemoveAlert(alert.id, label));

        item.appendChild(remove);
        container.appendChild(item);
    }
}

async function handleRemoveAlert(id: number, label: string): Promise<void> {
    try {
        await deleteAlert(id);
        toast(`Alert for ${label} deleted.`);
        await renderAlerts();
    } catch (error) {
        toast(messageFor(error), "error");
    }
}

async function handleAlertSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const symbol = el<HTMLSelectElement>("alert-symbol").value;
    const condition = el<HTMLSelectElement>("alert-condition").value;
    const priceInput = el<HTMLInputElement>("alert-price");
    const price = parseFloat(priceInput.value);

    if (!Number.isFinite(price) || price <= 0) {
        toast("Enter a target price above zero.", "error");
        priceInput.focus();
        return;
    }

    const submit = el<HTMLButtonElement>("alert-submit");
    submit.disabled = true;
    submit.textContent = "Creating…";

    try {
        await createAlert(symbol, condition, price);
        priceInput.value = "";
        toast(`Alert created for ${symbol}.`);
        await renderAlerts();
    } catch (error) {
        toast(messageFor(error), "error");
    } finally {
        submit.disabled = false;
        submit.textContent = "Create alert";
    }
}

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

    const gainer = withChange.reduce<AssetSummary | null>(
        (best, item) => (!best || (item.change_pct_24h as number) > (best.change_pct_24h as number) ? item : best),
        null
    );
    const loser = withChange.reduce<AssetSummary | null>(
        (worst, item) => (!worst || (item.change_pct_24h as number) < (worst.change_pct_24h as number) ? item : worst),
        null
    );

    const hasVolume = summary.some((item) => typeof item.volume_24h === "number");
    const totalVolume = summary.reduce(
        (sum, item) => sum + (typeof item.volume_24h === "number" ? item.volume_24h : 0),
        0
    );

    row.append(
        gainer
            ? makeStatCard("Top gainer · 24h", gainer.symbol, formatPrice(gainer.price_usd), deltaFor(gainer))
            : makeStatCard("Top gainer · 24h", "—", "Not enough data", null),
        loser
            ? makeStatCard("Top loser · 24h", loser.symbol, formatPrice(loser.price_usd), deltaFor(loser))
            : makeStatCard("Top loser · 24h", "—", "Not enough data", null),
        hasVolume
            ? makeStatCard("Total 24h volume", formatVolume(totalVolume), "across all assets", null)
            : makeStatCard("Total 24h volume", "—", "Not enough data", null)
    );
}

/** Apply the current filter tab and sort selection to the summary list. */
function sortedFilteredAssets(): AssetSummary[] {
    const filtered =
        assetFilter === "all" ? summary : summary.filter((item) => item.asset_type === assetFilter);

    const { key, dir } = assetSort;
    const factor = dir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
        if (key === "name") return factor * a.symbol.localeCompare(b.symbol);

        const av = key === "price" ? a.price_usd : a.change_pct_24h;
        const bv = key === "price" ? b.price_usd : b.change_pct_24h;

        // Assets with no price/change yet always sink to the bottom, whichever
        // direction is active — a null isn't "smaller", it's just unknown.
        if (typeof av !== "number" && typeof bv !== "number") return 0;
        if (typeof av !== "number") return 1;
        if (typeof bv !== "number") return -1;
        return factor * (av - bv);
    });
}

/** Reflect the active tab on the filter segmented control. */
function syncFilterButtons(): void {
    document.querySelectorAll<HTMLButtonElement>("#asset-filter .segmented__btn").forEach((btn) => {
        btn.setAttribute("aria-selected", String(btn.dataset.filter === assetFilter));
    });
}

/** Reflect the active sort key + direction, appending a ↑/↓ to the live column. */
function syncSortButtons(): void {
    document.querySelectorAll<HTMLButtonElement>("#assets-sort .sort-btn").forEach((btn) => {
        // Capture the plain label once so repeated renders don't stack arrows.
        const base = (btn.dataset.label ??= btn.textContent ?? "");
        const active = btn.dataset.key === assetSort.key;
        btn.dataset.active = String(active);
        btn.setAttribute("aria-pressed", String(active));
        btn.textContent = active ? `${base} ${assetSort.dir === "asc" ? "↑" : "↓"}` : base;
    });
}

function renderAssets(): void {
    syncFilterButtons();
    syncSortButtons();

    const container = el("assets-list");
    container.innerHTML = "";

    const rows = sortedFilteredAssets();
    if (rows.length === 0) {
        container.innerHTML = `<div class="empty"><strong>No assets</strong>Nothing matches this filter yet.</div>`;
        return;
    }

    for (const item of rows) {
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

/** Move between filter tabs. */
function setAssetFilter(filter: AssetFilter): void {
    assetFilter = filter;
    renderAssets();
}

/** Pick a sort column; clicking the active column flips its direction. New
    columns start descending for price/change (biggest first), ascending for name. */
function setAssetSort(key: SortKey): void {
    if (assetSort.key === key) {
        assetSort = { key, dir: assetSort.dir === "asc" ? "desc" : "asc" };
    } else {
        assetSort = { key, dir: key === "name" ? "asc" : "desc" };
    }
    renderAssets();
}

function renderOverview(): void {
    renderStatCards();
    renderAssets();
}

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

/* ---------- Chart + quote ---------- */

function updateQuote(symbol: string, points: PricePoint[]): void {
    const asset = assets.find((candidate) => candidate.symbol === symbol);
    el("quote-symbol").textContent = asset ? `${asset.symbol} · ${asset.name}` : symbol;

    if (points.length === 0) {
        el("quote-price").textContent = "—";
        el("quote-delta").textContent = "No data yet";
        el("quote-delta").className = "quote__delta";
        el("quote-updated").textContent = "Waiting for the next fetch";
        return;
    }

    const latest = points[points.length - 1];
    const first = points[0];
    el("quote-price").textContent = formatPrice(latest.price_usd);

    const delta = el("quote-delta");
    if (points.length > 1 && first.price_usd !== 0) {
        const change = latest.price_usd - first.price_usd;
        const pct = (change / first.price_usd) * 100;
        const rising = change >= 0;
        delta.textContent = `${rising ? "+" : "−"}${money.format(Math.abs(change))} (${Math.abs(pct).toFixed(2)}%)`;
        delta.className = `quote__delta ${rising ? "up" : "down"}`;
    } else {
        delta.textContent = "—";
        delta.className = "quote__delta";
    }

    el("quote-updated").textContent = `Updated ${new Date(latest.fetched_at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    })}`;
}

async function renderChart(symbol: string): Promise<void> {
    let points: PricePoint[];
    try {
        points = await getPrices(symbol, 48);
    } catch (error) {
        toast(messageFor(error), "error");
        return;
    }

    // The API returns newest-first; charts read oldest-to-newest.
    const ordered = [...points].reverse();
    updateQuote(symbol, ordered);

    const ChartLib = (window as any).Chart;
    if (!ChartLib) return;

    const accent = cssVar("--accent");
    const muted = cssVar("--muted");
    const grid = cssVar("--border");
    const surface = cssVar("--surface-2");
    const text = cssVar("--text");

    const canvas = el<HTMLCanvasElement>("price-chart");
    const context = canvas.getContext("2d");
    if (!context) return;

    const fill = context.createLinearGradient(0, 0, 0, canvas.height || 300);
    fill.addColorStop(0, currentTheme() === "dark" ? "rgba(0, 225, 123, 0.22)" : "rgba(0, 168, 92, 0.18)");
    fill.addColorStop(1, "rgba(0, 0, 0, 0)");

    if (priceChart) priceChart.destroy();

    priceChart = new ChartLib(context, {
        type: "line",
        data: {
            labels: ordered.map((point) =>
                new Date(point.fetched_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            ),
            datasets: [
                {
                    label: `${symbol} price (USD)`,
                    data: ordered.map((point) => point.price_usd),
                    borderColor: accent,
                    backgroundColor: fill,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: accent,
                    pointHoverBorderColor: surface,
                    pointHoverBorderWidth: 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: surface,
                    borderColor: grid,
                    borderWidth: 1,
                    titleColor: muted,
                    bodyColor: text,
                    titleFont: { size: 11, weight: "normal" },
                    bodyFont: { size: 14, weight: "600" },
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        // Hovering a point reports when it was fetched and what it cost.
                        title: (items: any[]) => {
                            const point = ordered[items[0].dataIndex];
                            if (!point) return "";
                            return new Date(point.fetched_at).toLocaleString([], {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                            });
                        },
                        label: (item: any) => money.format(item.parsed.y),
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { color: grid },
                    ticks: { color: muted, maxTicksLimit: 6, font: { size: 11 } },
                },
                y: {
                    grid: { color: grid },
                    border: { display: false },
                    ticks: {
                        color: muted,
                        maxTicksLimit: 5,
                        font: { size: 11 },
                        callback: (value: number) => money.format(value),
                    },
                },
            },
        },
    });
}

async function selectAsset(symbol: string): Promise<void> {
    chartedSymbol = symbol;
    el<HTMLSelectElement>("asset-selector").value = symbol;

    document.querySelectorAll<HTMLElement>(".asset-row").forEach((row) => {
        const rowSymbol = row.querySelector(".asset-row__sym")?.textContent;
        row.setAttribute("aria-current", String(rowSymbol === symbol));
    });

    await renderChart(symbol);
}

function populateAssetSelectors(): void {
    const selector = el<HTMLSelectElement>("asset-selector");
    const alertSymbol = el<HTMLSelectElement>("alert-symbol");
    selector.innerHTML = "";
    alertSymbol.innerHTML = "";

    for (const asset of assets) {
        const option = document.createElement("option");
        option.value = asset.symbol;
        option.textContent = `${asset.symbol} · ${asset.name}`;
        selector.appendChild(option);
        alertSymbol.appendChild(option.cloneNode(true));
    }
}

/* ---------- Session ---------- */

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

function handleLogout(): void {
    logout();
    if (priceChart) {
        priceChart.destroy();
        priceChart = null;
    }
    chartedSymbol = null;
    assets = [];
    summary = [];

    showAuth();
    setAuthMode("login");
    el<HTMLFormElement>("auth-form").reset();
    const submit = el<HTMLButtonElement>("auth-submit");
    submit.disabled = false;
    submit.textContent = "Sign in";
    toast("You're signed out.");
}

/* ---------- Wiring ---------- */

function init(): void {
    applyTheme("dark");
    setAuthMode("login");
    showAuth();

    el<HTMLFormElement>("auth-form").addEventListener("submit", (event) => void handleAuthSubmit(event as SubmitEvent));
    el("auth-switch-btn").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
    el("guest-btn").addEventListener("click", () => void enterGuest());

    const dialog = el<HTMLDialogElement>("logout-dialog");

    // Account menu: theme toggle keeps the menu open so the change is visible;
    // navigation items close it first.
    el("account-trigger").addEventListener("click", (event) => {
        event.stopPropagation();
        toggleAccountMenu();
    });
    el("menu-theme").addEventListener("click", () => {
        applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
    el("menu-signup").addEventListener("click", () => {
        setAccountMenu(false);
        promptSignup();
    });
    el("menu-logout").addEventListener("click", () => {
        setAccountMenu(false);
        dialog.showModal();
    });
    document.addEventListener("click", (event) => {
        if (!el("account-menu").contains(event.target as Node)) setAccountMenu(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") setAccountMenu(false);
    });

    // Assets panel: type filter tabs and click-to-sort columns.
    el("asset-filter").addEventListener("click", (event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".segmented__btn");
        if (btn) setAssetFilter(btn.dataset.filter as AssetFilter);
    });
    el("assets-sort").addEventListener("click", (event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".sort-btn");
        if (btn) setAssetSort(btn.dataset.key as SortKey);
    });

    el<HTMLFormElement>("watchlist-form").addEventListener("submit", (event) => void handleWatchlistSubmit(event as SubmitEvent));
    el<HTMLFormElement>("alert-form").addEventListener("submit", (event) => void handleAlertSubmit(event as SubmitEvent));
    el<HTMLSelectElement>("asset-selector").addEventListener("change", (event) => {
        void selectAsset((event.target as HTMLSelectElement).value);
    });

    el("logout-cancel").addEventListener("click", () => dialog.close());
    el("logout-confirm").addEventListener("click", () => {
        dialog.close();
        handleLogout();
    });
}

document.addEventListener("DOMContentLoaded", init);
