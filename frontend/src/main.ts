import { getWatchlist, addToWatchlist, removeFromWatchlist, getPrices, getAssets, getAlerts, createAlert, deleteAlert, login, signup, logout, isLoggedIn } from "./api.js";

let priceChart: any = null;

async function renderWatchlist() {
    const watchlist = await getWatchlist();
    const container = document.getElementById("watchlist-cards")!;
    container.innerHTML = "";

    if (!Array.isArray(watchlist)) {
        container.innerHTML = "<p>Please log in to see your watchlist.</p>";
        return;
    }

    watchlist.forEach((item: any) => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
            <span class="symbol">${item.symbol}</span>
            <span class="name">${item.name}</span>
            <span class="price">$${item.price_usd?.toFixed(2) ?? "N/A"}</span>
            <button onclick="removeAsset('${item.symbol}')">✕</button>
        `;
        card.onclick = () => loadChart(item.symbol);
        container.appendChild(card);
    });
}

async function renderAlerts() {
    const alerts = await getAlerts();
    const container = document.getElementById("alerts-list")!;
    container.innerHTML = "";

    if (!Array.isArray(alerts)) {
        container.innerHTML = "<p>Please log in to see your alerts.</p>";
        return;
    }

    alerts.forEach((alert: any) => {
        const div = document.createElement("div");
        div.className = `alert-item ${alert.is_triggered ? "triggered" : ""}`;
        div.innerHTML = `
            <span>Asset ID: ${alert.asset_id} ${alert.condition} $${alert.target_price}</span>
            <span>${alert.is_triggered ? "✓ Triggered" : "Pending"}</span>
            <button onclick="removeAlert(${alert.id})">✕</button>
        `;
        container.appendChild(div);
    });
}

async function populateAssetSelectors() {
    const assets = await getAssets();
    const selector = document.getElementById("asset-selector") as HTMLSelectElement;
    const alertSymbol = document.getElementById("alert-symbol") as HTMLSelectElement;

    assets.forEach((asset: any) => {
        const option1 = document.createElement("option");
        option1.value = asset.symbol;
        option1.text = asset.symbol;
        selector.appendChild(option1);

        const option2 = document.createElement("option");
        option2.value = asset.symbol;
        option2.text = asset.symbol;
        alertSymbol.appendChild(option2);
    });

    if (assets.length > 0) loadChart(assets[0].symbol);
}

async function loadChart(symbol: string) {
    const prices = await getPrices(symbol, 48);
    const labels = prices.map((p: any) => new Date(p.fetched_at).toLocaleTimeString()).reverse();
    const data = prices.map((p: any) => p.price_usd).reverse();

    const ctx = (document.getElementById("price-chart") as HTMLCanvasElement).getContext("2d")!;

    if (priceChart) priceChart.destroy();

    priceChart = new (window as any).Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: `${symbol} Price (USD)`,
                data,
                borderColor: "#00ff88",
                backgroundColor: "rgba(0,255,136,0.1)",
                tension: 0.3,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: "#fff" } } },
            scales: {
                x: { ticks: { color: "#aaa" } },
                y: { ticks: { color: "#aaa" } }
            }
        }
    });
}

function updateNavAuth() {
    const navActions = document.getElementById("nav-actions")!;
    if (isLoggedIn()) {
        navActions.innerHTML = `
            <button class="theme-toggle" id="theme-toggle">☀️ Light Mode</button>
            <button onclick="handleLogout()">Logout</button>
        `;
    } else {
        navActions.innerHTML = `
            <button class="theme-toggle" id="theme-toggle">☀️ Light Mode</button>
            <button onclick="showAuth('login')">Login</button>
            <button onclick="showAuth('signup')">Sign Up</button>
        `;
    }
    document.getElementById("theme-toggle")!.addEventListener("click", () => {
        const html = document.documentElement;
        const isDark = html.getAttribute("data-theme") === "dark";
        html.setAttribute("data-theme", isDark ? "light" : "dark");
        document.getElementById("theme-toggle")!.textContent = isDark ? "🌙 Dark Mode" : "☀️ Light Mode";
    });
}

(window as any).showAuth = (mode: string) => {
    const modal = document.getElementById("auth-modal")!;
    const title = document.getElementById("auth-title")!;
    title.textContent = mode === "login" ? "Login" : "Sign Up";
    modal.style.display = "flex";
    (window as any).currentAuthMode = mode;
};

(window as any).closeAuth = () => {
    document.getElementById("auth-modal")!.style.display = "none";
};

(window as any).submitAuth = async () => {
    const email = (document.getElementById("auth-email") as HTMLInputElement).value;
    const password = (document.getElementById("auth-password") as HTMLInputElement).value;
    const mode = (window as any).currentAuthMode;

    if (mode === "signup") {
        const username = (document.getElementById("auth-username") as HTMLInputElement).value;
        await signup(username, email, password);
    } else {
        await login(email, password);
    }

    (window as any).closeAuth();
    updateNavAuth();
    renderWatchlist();
    renderAlerts();
};

(window as any).handleLogout = () => {
    logout();
    updateNavAuth();
    renderWatchlist();
    renderAlerts();
};

(window as any).addToWatchlist = async () => {
    const input = document.getElementById("symbol-input") as HTMLInputElement;
    await addToWatchlist(input.value.toUpperCase());
    input.value = "";
    renderWatchlist();
};

(window as any).removeAsset = async (symbol: string) => {
    await removeFromWatchlist(symbol);
    renderWatchlist();
};

(window as any).createAlert = async () => {
    const symbol = (document.getElementById("alert-symbol") as HTMLSelectElement).value;
    const condition = (document.getElementById("alert-condition") as HTMLSelectElement).value;
    const price = parseFloat((document.getElementById("alert-price") as HTMLInputElement).value);
    await createAlert(symbol, condition, price);
    renderAlerts();
};

(window as any).removeAlert = async (id: number) => {
    await deleteAlert(id);
    renderAlerts();
};

(window as any).refreshAll = () => {
    renderWatchlist();
    renderAlerts();
};

(window as any).loadChart = loadChart;

document.addEventListener("DOMContentLoaded", () => {
    updateNavAuth();
    populateAssetSelectors();
    renderWatchlist();
    renderAlerts();
});