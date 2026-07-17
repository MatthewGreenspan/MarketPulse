const BASE_URL = "http://localhost:8000";

let authToken: string | null = null;

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

export interface Asset {
    id: number;
    symbol: string;
    name: string;
    asset_type: string;
}

export interface WatchlistItem {
    id: number;
    symbol: string;
    name: string;
    price_usd: number | null;
    fetched_at: string | null;
}

export interface Alert {
    id: number;
    asset_id: number;
    symbol: string | null;
    name: string | null;
    condition: string;
    target_price: number;
    is_triggered: boolean;
    triggered_at: string | null;
    created_at: string | null;
}

export interface PricePoint {
    price_usd: number;
    fetched_at: string;
}

function authHeaders(): Record<string, string> {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

/** FastAPI reports errors as `detail`: a string, or a list of validation objects. */
function readError(payload: any, status: number): string {
    const detail = payload?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0];
        const msg = typeof first?.msg === "string" ? first.msg : "";
        return msg.replace(/^Value error,\s*/, "") || "That request wasn't valid.";
    }
    if (typeof payload?.error === "string") return payload.error;
    return `Something went wrong (${status}).`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${BASE_URL}${path}`, init);
    } catch {
        throw new ApiError("Can't reach the server. Is the backend running?", 0);
    }

    const body = response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
        throw new ApiError(readError(body, response.status), response.status);
    }

    // Some endpoints report failures as 200 + {"error": "..."}.
    if (body && typeof body === "object" && typeof (body as any).error === "string") {
        throw new ApiError((body as any).error, 200);
    }

    return body as T;
}

function jsonPost(payload: unknown): RequestInit {
    return {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    };
}

export async function signup(email: string, password: string): Promise<void> {
    const data = await request<{ token: string }>("/auth/signup", jsonPost({ email, password }));
    authToken = data.token;
}

export async function login(email: string, password: string): Promise<void> {
    const data = await request<{ token: string }>("/auth/login", jsonPost({ email, password }));
    authToken = data.token;
}

export function logout(): void {
    authToken = null;
}

export function isLoggedIn(): boolean {
    return authToken !== null;
}

export function getAssets(): Promise<Asset[]> {
    return request<Asset[]>("/assets/");
}

export function getPrices(symbol: string, limit = 48): Promise<PricePoint[]> {
    return request<PricePoint[]>(`/assets/${encodeURIComponent(symbol)}/prices?limit=${limit}`);
}

export function getWatchlist(): Promise<WatchlistItem[]> {
    return request<WatchlistItem[]>("/watchlist/", { headers: authHeaders() });
}

export function addToWatchlist(symbol: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/watchlist/?symbol=${encodeURIComponent(symbol)}`, {
        method: "POST",
        headers: authHeaders(),
    });
}

export function removeFromWatchlist(symbol: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/watchlist/${encodeURIComponent(symbol)}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
}

export function getAlerts(): Promise<Alert[]> {
    return request<Alert[]>("/alerts/", { headers: authHeaders() });
}

export function createAlert(symbol: string, condition: string, targetPrice: number): Promise<{ message: string }> {
    const query = `symbol=${encodeURIComponent(symbol)}&condition=${encodeURIComponent(condition)}&target_price=${targetPrice}`;
    return request<{ message: string }>(`/alerts/?${query}`, {
        method: "POST",
        headers: authHeaders(),
    });
}

export function deleteAlert(alertId: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/alerts/${alertId}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
}
