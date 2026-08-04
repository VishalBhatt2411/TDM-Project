import axios from "axios";

// Staff auth is entirely cookie-based (HttpOnly, set by the backend) — no token is
// ever read or attached here. `withCredentials` is what makes the browser send
// those cookies on cross-port (localhost:5173 -> localhost:3000) requests.
export const adminApiClient = axios.create({ baseURL: "/api/v1", withCredentials: true });

let refreshInFlight: Promise<unknown> | null = null;

adminApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // Only the refresh endpoint itself is excluded, so a 401 from GET /admin/auth/me
    // (e.g. right after a page reload, before the browser has resent cookies) still
    // triggers a refresh-and-retry.
    const isRefreshEndpoint = original?.url?.startsWith("/admin/auth/refresh");
    if (error.response?.status !== 401 || isRefreshEndpoint || original._retried) {
      return Promise.reject(error);
    }
    original._retried = true;

    try {
      refreshInFlight ??= adminApiClient.post("/admin/auth/refresh").finally(() => {
        refreshInFlight = null;
      });
      await refreshInFlight;
      return adminApiClient(original);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);
