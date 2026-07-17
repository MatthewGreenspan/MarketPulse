const BASE_URL = "http://localhost:8000";

export async function getAssets() {
    const response = await fetch(`${BASE_URL}/assets/`);
    return response.json();
}

export async function getWatchlist() {
    const response = await fetch(`${BASE_URL}/watchlist/`);
    return response.json();
}

export async function addToWatchlist(symbol: string) {
    const response = await fetch(`${BASE_URL}/watchlist/?symbol=${symbol}`, {
        method: "POST",
    });
    return response.json();
}

export async function removeFromWatchlist(symbol: string) {
    const response = await fetch(`${BASE_URL}/watchlist/${symbol}`, {
        method: "DELETE",
    });
    return response.json();
}

export async function getPrices(symbol: string, limit: number = 48) {
    const response = await fetch(`${BASE_URL}/assets/${symbol}/prices?limit=${limit}`);
    return response.json();
}

export async function getAlerts() {
    const response = await fetch(`${BASE_URL}/alerts/`);
    return response.json();
}

export async function createAlert(symbol: string, condition: string, targetPrice: number) {
    const response = await fetch(
        `${BASE_URL}/alerts/?symbol=${symbol}&condition=${condition}&target_price=${targetPrice}`,
        { method: "POST" }
    );
    return response.json();
}

export async function deleteAlert(alertId: number) {
    const response = await fetch(`${BASE_URL}/alerts/${alertId}`, {
        method: "DELETE",
    });
    return response.json();
}