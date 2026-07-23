const ACCESS_TOKEN_KEY = "tdm.accessToken";
const REFRESH_TOKEN_KEY = "tdm.refreshToken";

export const tokenStorage = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setTokens: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export function decodeCustomerId(accessToken: string): string | null {
  try {
    const payloadBase64 = accessToken.split(".")[1];
    const payload = JSON.parse(atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
