const ACCESS_TOKEN_KEY = "tdm.admin.accessToken";
const REFRESH_TOKEN_KEY = "tdm.admin.refreshToken";

export const adminTokenStorage = {
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

export interface StaffTokenPayload {
  sub: string;
  role: "Admin" | "Manager" | "SalesRep";
  permissions: string[];
  /** Sales_Rep__c record Id this staff account is linked to — undefined unless explicitly provisioned. */
  salesRepId?: string;
}

export function decodeStaffToken(accessToken: string): StaffTokenPayload | null {
  try {
    const payloadBase64 = accessToken.split(".")[1];
    const payload = JSON.parse(atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")));
    return { sub: payload.sub, role: payload.role, permissions: payload.permissions ?? [], salesRepId: payload.salesRepId };
  } catch {
    return null;
  }
}
