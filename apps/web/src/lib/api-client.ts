import axios from "axios";
import { tokenStorage } from "./token-storage";

export const apiClient = axios.create({ baseURL: "/api/v1" });

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const UNAUTHENTICATED_AUTH_PATHS = [
  "/auth/register",
  "/auth/verify-otp",
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/magic-login",
  "/auth/forgot-password",
  "/auth/reset-password",
];

let refreshInFlight: Promise<string> | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // Only the unauthenticated credential endpoints are exempt: a 401 there means bad credentials, not an expired session. /auth/me (and PATCH /auth/me) take the access token and must refresh like any other call.
    const isCredentialEndpoint = UNAUTHENTICATED_AUTH_PATHS.some((path) => original?.url === path);
    if (error.response?.status !== 401 || !original || isCredentialEndpoint || original._retried) {
      return Promise.reject(error);
    }
    original._retried = true;

    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) {
      tokenStorage.clear();
      return Promise.reject(error);
    }

    try {
      refreshInFlight ??= apiClient
        .post("/auth/refresh", { refreshToken })
        .then((res) => {
          tokenStorage.setTokens(res.data.accessToken, res.data.refreshToken);
          return res.data.accessToken as string;
        })
        .finally(() => {
          refreshInFlight = null;
        });

      const newAccessToken = await refreshInFlight;
      original.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(original);
    } catch (refreshError) {
      tokenStorage.clear();
      return Promise.reject(refreshError);
    }
  },
);
