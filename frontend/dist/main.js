var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ApiError, addToWatchlist, createAlert, deleteAlert, getAlerts, getAssets, getPrices, getWatchlist, isLoggedIn, login, logout, removeFromWatchlist, signup, } from "./api.js";
import { startBackdrop, stopBackdrop } from "./backdrop.js";
let authMode = "login";
let priceChart = null;
let chartedSymbol = null;
let assets = [];
function el(id) {
    const node = document.getElementById(id);
    if (!node)
        throw new Error(`Missing element: #${id}`);
    return node;
}
const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});
function formatPrice(value) {
    return typeof value === "number" ? money.format(value) : "—";
}
/* ---------- Toast ---------- */
let toastTimer;
function toast(message, tone = "info") {
    const node = el("toast");
    node.textContent = message;
    node.dataset.tone = tone;
    node.dataset.visible = "true";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        node.dataset.visible = "false";
    }, 4000);
}
function messageFor(error) {
    return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}
/* ---------- Theme ---------- */
const SUN_ICON = `<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />`;
const MOON_ICON = `<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />`;
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const toggle = el("theme-toggle");
    const icon = el("theme-icon");
    const nextIsLight = theme === "dark";
    toggle.setAttribute("aria-label", nextIsLight ? "Switch to light mode" : "Switch to dark mode");
    icon.innerHTML = nextIsLight ? SUN_ICON : MOON_ICON;
    if (chartedSymbol)
        void renderChart(chartedSymbol);
}
function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}
function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
/* ---------- Views ---------- */
function showApp() {
    el("auth-view").hidden = true;
    el("app-view").hidden = false;
    stopBackdrop();
}
function showAuth() {
    el("auth-view").hidden = false;
    el("app-view").hidden = true;
    startBackdrop(el("auth-backdrop"));
}
/** Add forms are only usable when signed in. The gate normally covers this,
    but the panels stay honest if they ever render unauthenticated. */
function syncFormVisibility() {
    const signedIn = isLoggedIn();
    el("watchlist-form").hidden = !signedIn;
    el("alert-form").hidden = !signedIn;
}
/* ---------- Auth form ---------- */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
function setFieldError(inputId, errorId, message) {
    const input = el(inputId);
    el(errorId).textContent = message;
    if (message) {
        input.setAttribute("aria-invalid", "true");
    }
    else {
        input.removeAttribute("aria-invalid");
    }
}
function clearAuthErrors() {
    setFieldError("auth-email", "auth-email-error", "");
    setFieldError("auth-password", "auth-password-error", "");
    setFieldError("auth-confirm", "auth-confirm-error", "");
    const banner = el("auth-error");
    banner.dataset.visible = "false";
    banner.textContent = "";
}
function showAuthError(message) {
    const banner = el("auth-error");
    banner.textContent = message;
    banner.dataset.visible = "true";
}
function setAuthMode(mode) {
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
    el("auth-password").autocomplete = signingUp ? "new-password" : "current-password";
    // Confirm never carries a value across modes: a stale value is invisible on
    // sign-in and would append to whatever gets pasted next.
    const confirm = el("auth-confirm");
    confirm.required = signingUp;
    confirm.disabled = !signingUp;
    confirm.value = "";
    clearAuthErrors();
}
function validateAuthForm(email, password, confirm) {
    clearAuthErrors();
    let valid = true;
    if (!email) {
        setFieldError("auth-email", "auth-email-error", "Enter your email address");
        valid = false;
    }
    else if (!EMAIL_PATTERN.test(email)) {
        setFieldError("auth-email", "auth-email-error", "Enter a valid email address, like you@domain.com");
        valid = false;
    }
    if (!password) {
        setFieldError("auth-password", "auth-password-error", "Enter your password");
        valid = false;
    }
    else if (authMode === "signup" && password.length < 8) {
        setFieldError("auth-password", "auth-password-error", "Use at least 8 characters");
        valid = false;
    }
    if (authMode === "signup") {
        if (!confirm) {
            setFieldError("auth-confirm", "auth-confirm-error", "Re-enter your password");
            valid = false;
        }
        else if (confirm !== password) {
            setFieldError("auth-confirm", "auth-confirm-error", "Passwords don't match");
            valid = false;
        }
    }
    return valid;
}
function handleAuthSubmit(event) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        event.preventDefault();
        const email = el("auth-email").value.trim();
        const password = el("auth-password").value;
        const confirm = el("auth-confirm").value;
        if (!validateAuthForm(email, password, confirm))
            return;
        const submit = el("auth-submit");
        const label = (_a = submit.textContent) !== null && _a !== void 0 ? _a : "";
        submit.disabled = true;
        submit.textContent = authMode === "signup" ? "Creating account…" : "Signing in…";
        try {
            if (authMode === "signup") {
                yield signup(email, password);
            }
            else {
                yield login(email, password);
            }
            // Let the browser offer to save the credentials before the form leaves the DOM.
            yield enterApp();
        }
        catch (error) {
            showAuthError(messageFor(error));
        }
        finally {
            // Always restore the control, including on success: the form is reused
            // after sign-out, and a stuck label is the only symptom a user would see.
            submit.disabled = false;
            submit.textContent = label;
        }
    });
}
/* ---------- Watchlist ---------- */
function skeletons(count) {
    return Array.from({ length: count }, () => `<div class="skeleton"></div>`).join("");
}
function renderWatchlist() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = el("watchlist-cards");
        const count = el("watchlist-count");
        container.innerHTML = skeletons(3);
        let items;
        try {
            items = yield getWatchlist();
        }
        catch (error) {
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
            row.querySelector(".asset-row__sym").textContent = item.symbol;
            row.querySelector(".asset-row__name").textContent = item.name;
            row.querySelector(".asset-row__price").textContent = formatPrice(item.price_usd);
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
    });
}
function handleRemoveAsset(symbol, name) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield removeFromWatchlist(symbol);
            toast(`${name} removed from your watchlist.`);
            yield renderWatchlist();
        }
        catch (error) {
            toast(messageFor(error), "error");
        }
    });
}
function handleWatchlistSubmit(event) {
    return __awaiter(this, void 0, void 0, function* () {
        event.preventDefault();
        const input = el("symbol-input");
        const symbol = input.value.trim().toUpperCase();
        if (!symbol)
            return;
        const submit = el("watchlist-submit");
        submit.disabled = true;
        submit.textContent = "Adding…";
        try {
            yield addToWatchlist(symbol);
            input.value = "";
            toast(`${symbol} added to your watchlist.`);
            yield renderWatchlist();
        }
        catch (error) {
            toast(messageFor(error), "error");
        }
        finally {
            submit.disabled = false;
            submit.textContent = "Add";
        }
    });
}
/* ---------- Alerts ---------- */
function describeAlert(alert) {
    const direction = alert.condition === "above" ? "Rises above" : "Falls below";
    return `${direction} ${money.format(alert.target_price)}`;
}
function renderAlerts() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const container = el("alerts-list");
        const count = el("alerts-count");
        container.innerHTML = skeletons(2);
        let alerts;
        try {
            alerts = yield getAlerts();
        }
        catch (error) {
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
            const label = (_b = (_a = alert.name) !== null && _a !== void 0 ? _a : alert.symbol) !== null && _b !== void 0 ? _b : "Unknown asset";
            item.querySelector(".alert-item__asset").textContent = label;
            item.querySelector(".alert-item__rule").textContent = describeAlert(alert);
            const tag = item.querySelector(".tag");
            tag.textContent = alert.is_triggered ? "Triggered" : "Watching";
            if (alert.is_triggered)
                tag.classList.add("tag--live");
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "icon-btn";
            remove.setAttribute("aria-label", `Delete alert for ${label}`);
            remove.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>`;
            remove.addEventListener("click", () => void handleRemoveAlert(alert.id, label));
            item.appendChild(remove);
            container.appendChild(item);
        }
    });
}
function handleRemoveAlert(id, label) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield deleteAlert(id);
            toast(`Alert for ${label} deleted.`);
            yield renderAlerts();
        }
        catch (error) {
            toast(messageFor(error), "error");
        }
    });
}
function handleAlertSubmit(event) {
    return __awaiter(this, void 0, void 0, function* () {
        event.preventDefault();
        const symbol = el("alert-symbol").value;
        const condition = el("alert-condition").value;
        const priceInput = el("alert-price");
        const price = parseFloat(priceInput.value);
        if (!Number.isFinite(price) || price <= 0) {
            toast("Enter a target price above zero.", "error");
            priceInput.focus();
            return;
        }
        const submit = el("alert-submit");
        submit.disabled = true;
        submit.textContent = "Creating…";
        try {
            yield createAlert(symbol, condition, price);
            priceInput.value = "";
            toast(`Alert created for ${symbol}.`);
            yield renderAlerts();
        }
        catch (error) {
            toast(messageFor(error), "error");
        }
        finally {
            submit.disabled = false;
            submit.textContent = "Create alert";
        }
    });
}
/* ---------- Chart + quote ---------- */
function updateQuote(symbol, points) {
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
    }
    else {
        delta.textContent = "—";
        delta.className = "quote__delta";
    }
    el("quote-updated").textContent = `Updated ${new Date(latest.fetched_at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    })}`;
}
function renderChart(symbol) {
    return __awaiter(this, void 0, void 0, function* () {
        let points;
        try {
            points = yield getPrices(symbol, 48);
        }
        catch (error) {
            toast(messageFor(error), "error");
            return;
        }
        // The API returns newest-first; charts read oldest-to-newest.
        const ordered = [...points].reverse();
        updateQuote(symbol, ordered);
        const ChartLib = window.Chart;
        if (!ChartLib)
            return;
        const accent = cssVar("--accent");
        const muted = cssVar("--muted");
        const grid = cssVar("--border");
        const surface = cssVar("--surface-2");
        const text = cssVar("--text");
        const canvas = el("price-chart");
        const context = canvas.getContext("2d");
        if (!context)
            return;
        const fill = context.createLinearGradient(0, 0, 0, canvas.height || 300);
        fill.addColorStop(0, currentTheme() === "dark" ? "rgba(0, 225, 123, 0.22)" : "rgba(0, 168, 92, 0.18)");
        fill.addColorStop(1, "rgba(0, 0, 0, 0)");
        if (priceChart)
            priceChart.destroy();
        priceChart = new ChartLib(context, {
            type: "line",
            data: {
                labels: ordered.map((point) => new Date(point.fetched_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })),
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
                            title: (items) => {
                                const point = ordered[items[0].dataIndex];
                                if (!point)
                                    return "";
                                return new Date(point.fetched_at).toLocaleString([], {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                });
                            },
                            label: (item) => money.format(item.parsed.y),
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
                            callback: (value) => money.format(value),
                        },
                    },
                },
            },
        });
    });
}
function selectAsset(symbol) {
    return __awaiter(this, void 0, void 0, function* () {
        chartedSymbol = symbol;
        el("asset-selector").value = symbol;
        document.querySelectorAll(".asset-row").forEach((row) => {
            var _a;
            const rowSymbol = (_a = row.querySelector(".asset-row__sym")) === null || _a === void 0 ? void 0 : _a.textContent;
            row.setAttribute("aria-current", String(rowSymbol === symbol));
        });
        yield renderChart(symbol);
    });
}
function populateAssetSelectors() {
    const selector = el("asset-selector");
    const alertSymbol = el("alert-symbol");
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
function enterApp() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        showApp();
        syncFormVisibility();
        try {
            assets = yield getAssets();
            populateAssetSelectors();
        }
        catch (error) {
            toast(messageFor(error), "error");
        }
        const first = (_a = assets[0]) === null || _a === void 0 ? void 0 : _a.symbol;
        yield Promise.all([
            renderWatchlist(),
            renderAlerts(),
            first ? selectAsset(first) : Promise.resolve(),
        ]);
    });
}
function handleLogout() {
    logout();
    if (priceChart) {
        priceChart.destroy();
        priceChart = null;
    }
    chartedSymbol = null;
    assets = [];
    showAuth();
    setAuthMode("login");
    el("auth-form").reset();
    const submit = el("auth-submit");
    submit.disabled = false;
    submit.textContent = "Sign in";
    toast("You're signed out.");
}
/* ---------- Wiring ---------- */
function init() {
    applyTheme("dark");
    setAuthMode("login");
    showAuth();
    el("auth-form").addEventListener("submit", (event) => void handleAuthSubmit(event));
    el("auth-switch-btn").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
    el("theme-toggle").addEventListener("click", () => {
        applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
    el("watchlist-form").addEventListener("submit", (event) => void handleWatchlistSubmit(event));
    el("alert-form").addEventListener("submit", (event) => void handleAlertSubmit(event));
    el("asset-selector").addEventListener("change", (event) => {
        void selectAsset(event.target.value);
    });
    const dialog = el("logout-dialog");
    el("logout-btn").addEventListener("click", () => dialog.showModal());
    el("logout-cancel").addEventListener("click", () => dialog.close());
    el("logout-confirm").addEventListener("click", () => {
        dialog.close();
        handleLogout();
    });
}
document.addEventListener("DOMContentLoaded", init);
