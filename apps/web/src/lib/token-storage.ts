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
    window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
  },
};

const SESSION_CLEARED_EVENT = "tdm:session-cleared";

/**
 * Notifies `listener` whenever the stored session goes away outside the auth context's own logout — the
 * HTTP client giving up on an expired refresh token, or a sign-out in another tab — so React state
 * doesn't keep presenting a signed-in customer whose every request now fails.
 */
export function onSessionCleared(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || (event.key === ACCESS_TOKEN_KEY && event.newValue === null)) listener();
  };
  window.addEventListener(SESSION_CLEARED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SESSION_CLEARED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function decodeCustomerId(accessToken: string): string | null {
  try {
    const payloadBase64 = accessToken.split(".")[1];
    const payload = JSON.parse(atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
