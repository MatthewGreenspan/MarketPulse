import { getWatchlist, addToWatchlist, removeFromWatchlist, getPrices, getAssets, getAlerts, createAlert, deleteAlert } from "./api.js";

let priceChart: any = null;

async function renderWatchlist() {
    const watchlist = await getWatchlist();
    const container = document.getElementById("watchlist-cards")!;
    container.innerHTML = "";

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
}

async function loadChart(symbol: string) {
    const prices = await getPrices(symbol, 48);
    const labels = prices.map((p: any) => new Date(p.fetched_at).toLocaleTimeString());
    const data = prices.map((p: any) => p.price_usd);

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

document.addEventListener("DOMContentLoaded", () => {
    populateAssetSelectors();
    renderWatchlist();
    renderAlerts();
});