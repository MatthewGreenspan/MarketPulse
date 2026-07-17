const BASE_URL = "http://localhost:8000";

let authToken: string | null = null;

function getToken(): string | null {
    return authToken;
}

function authHeaders(): HeadersInit {
    const token = getToken();
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

export async function signup(username: string, email: string, password: string) {
    const response = await fetch(`${BASE_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password })
    });
    const data = await response.json();
    if (data.token) authToken = data.token;
    return data;
}

export async function login(email: string, password: string) {
    const response = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (data.token) authToken = data.token;
    return data;
}

export function logout() {
    authToken = null;
    window.location.reload();
}

export function isLoggedIn(): boolean {
    return !!authToken;
}

export async function getAssets() {
    const response = await fetch(`${BASE_URL}/assets/`);
    return response.json();
}

export async function getWatchlist() {
    const response = await fetch(`${BASE_URL}/watchlist/`, {
        headers: authHeaders()
    });
    return response.json();
}

export async function addToWatchlist(symbol: string) {
    const response = await fetch(`${BASE_URL}/watchlist/?symbol=${symbol}`, {
        method: "POST",
        headers: authHeaders()
    });
    return response.json();
}

export async function removeFromWatchlist(symbol: string) {
    const response = await fetch(`${BASE_URL}/watchlist/${symbol}`, {
        method: "DELETE",
        headers: authHeaders()
    });
    return response.json();
}

export async function getPrices(symbol: string, limit: number = 48) {
    const response = await fetch(`${BASE_URL}/assets/${symbol}/prices?limit=${limit}`);
    return response.json();
}

export async function getAlerts() {
    const response = await fetch(`${BASE_URL}/alerts/`, {
        headers: authHeaders()
    });
    return response.json();
}

export async function createAlert(symbol: string, condition: string, targetPrice: number) {
    const response = await fetch(
        `${BASE_URL}/alerts/?symbol=${symbol}&condition=${condition}&target_price=${targetPrice}`,
        { method: "POST", headers: authHeaders() }
    );
    return response.json();
}

export async function deleteAlert(alertId: number) {
    const response = await fetch(`${BASE_URL}/alerts/${alertId}`, {
        method: "DELETE",
        headers: authHeaders()
    });
    return response.json();
}