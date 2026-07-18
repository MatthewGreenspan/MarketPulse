var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Same-origin by default: the FastAPI backend serves this frontend, so relative
// paths ("/assets/…") hit the API directly and work in local dev and a bundled
// deploy alike. For a split deploy (frontend on a different host than the API),
// set window.__API_BASE__ = "https://your-api.example.com" before this loads.
const BASE_URL = (typeof window !== "undefined" && window.__API_BASE__) || "";
let authToken = null;
let guest = false;
export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}
function authHeaders() {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}
/** FastAPI reports errors as `detail`: a string, or a list of validation objects. */
function readError(payload, status) {
    const detail = payload === null || payload === void 0 ? void 0 : payload.detail;
    if (typeof detail === "string")
        return detail;
    if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0];
        const msg = typeof (first === null || first === void 0 ? void 0 : first.msg) === "string" ? first.msg : "";
        return msg.replace(/^Value error,\s*/, "") || "That request wasn't valid.";
    }
    if (typeof (payload === null || payload === void 0 ? void 0 : payload.error) === "string")
        return payload.error;
    return `Something went wrong (${status}).`;
}
function request(path_1) {
    return __awaiter(this, arguments, void 0, function* (path, init = {}) {
        let response;
        try {
            response = yield fetch(`${BASE_URL}${path}`, init);
        }
        catch (_a) {
            throw new ApiError("Can't reach the server. Is the backend running?", 0);
        }
        const body = response.status === 204 ? null : yield response.json().catch(() => null);
        if (!response.ok) {
            throw new ApiError(readError(body, response.status), response.status);
        }
        // Some endpoints report failures as 200 + {"error": "..."}.
        if (body && typeof body === "object" && typeof body.error === "string") {
            throw new ApiError(body.error, 200);
        }
        return body;
    });
}
function jsonPost(payload) {
    return {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    };
}
export function signup(email, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield request("/auth/signup", jsonPost({ email, password }));
        authToken = data.token;
        guest = false;
    });
}
export function login(email, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield request("/auth/login", jsonPost({ email, password }));
        authToken = data.token;
        guest = false;
    });
}
export function logout() {
    authToken = null;
    guest = false;
}
export function isLoggedIn() {
    return authToken !== null;
}
export function enterGuestMode() {
    guest = true;
    authToken = null;
}
export function isGuest() {
    return guest;
}
export function getAssetSummary() {
    return request("/assets/summary");
}
export function getAssets() {
    return request("/assets/");
}
export function getPrices(symbol, limit = 48) {
    return request(`/assets/${encodeURIComponent(symbol)}/prices?limit=${limit}`);
}
export function getWatchlist() {
    return request("/watchlist/", { headers: authHeaders() });
}
export function addToWatchlist(symbol) {
    return request(`/watchlist/?symbol=${encodeURIComponent(symbol)}`, {
        method: "POST",
        headers: authHeaders(),
    });
}
export function removeFromWatchlist(symbol) {
    return request(`/watchlist/${encodeURIComponent(symbol)}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
}
export function getAlerts() {
    return request("/alerts/", { headers: authHeaders() });
}
export function createAlert(symbol, condition, targetPrice) {
    const query = `symbol=${encodeURIComponent(symbol)}&condition=${encodeURIComponent(condition)}&target_price=${targetPrice}`;
    return request(`/alerts/?${query}`, {
        method: "POST",
        headers: authHeaders(),
    });
}
export function deleteAlert(alertId) {
    return request(`/alerts/${encodeURIComponent(alertId)}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
}
