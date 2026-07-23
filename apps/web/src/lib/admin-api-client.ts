import axios from "axios";
import { adminTokenStorage } from "./admin-token-storage";

export const adminApiClient = axios.create({ baseURL: "/api/v1" });

adminApiClient.interceptors.request.use((config) => {
  const token = adminTokenStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<string> | null = null;

adminApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = original?.url?.startsWith("/admin/auth/");
    if (error.response?.status !== 401 || isAuthEndpoint || original._retried) {
      return Promise.reject(error);
    }
    original._retried = true;

    const refreshToken = adminTokenStorage.getRefreshToken();
    if (!refreshToken) {
      adminTokenStorage.clear();
      return Promise.reject(error);
    }

    try {
      refreshInFlight ??= adminApiClient
        .post("/admin/auth/refresh", { refreshToken })
        .then((res) => {
          adminTokenStorage.setTokens(res.data.accessToken, res.data.refreshToken);
          return res.data.accessToken as string;
        })
        .finally(() => {
          refreshInFlight = null;
        });

      const newAccessToken = await refreshInFlight;
      original.headers.Authorization = `Bearer ${newAccessToken}`;
      return adminApiClient(original);
    } catch (refreshError) {
      adminTokenStorage.clear();
      return Promise.reject(refreshError);
    }
  },
);
