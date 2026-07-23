import * as React from "react";
import { adminApiClient } from "@/lib/admin-api-client";
import { adminTokenStorage, decodeStaffToken } from "@/lib/admin-token-storage";
import type { StaffTokenPayload } from "@/lib/admin-token-storage";

interface AdminAuthContextValue {
  staff: StaffTokenPayload | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  logout: () => void;
  hasPermission: (key: string) => boolean;
}

const AdminAuthContext = React.createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = React.useState<StaffTokenPayload | null>(() => {
    const token = adminTokenStorage.getAccessToken();
    return token ? decodeStaffToken(token) : null;
  });

  const applyTokens = React.useCallback((accessToken: string, refreshToken: string) => {
    adminTokenStorage.setTokens(accessToken, refreshToken);
    setStaff(decodeStaffToken(accessToken));
  }, []);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const { data } = await adminApiClient.post("/admin/auth/login", { email, password });
      applyTokens(data.accessToken, data.refreshToken);
    },
    [applyTokens],
  );

  const forgotPassword = React.useCallback(async (email: string) => {
    await adminApiClient.post("/admin/auth/forgot-password", { email });
  }, []);

  const resetPassword = React.useCallback(async (token: string, newPassword: string) => {
    await adminApiClient.post("/admin/auth/reset-password", { token, newPassword });
  }, []);

  const logout = React.useCallback(() => {
    adminTokenStorage.clear();
    setStaff(null);
  }, []);

  const hasPermission = React.useCallback(
    (key: string) => !!staff && (staff.role === "Admin" || staff.permissions.includes(key)),
    [staff],
  );

  const value = React.useMemo(
    () => ({ staff, isAuthenticated: !!staff, login, forgotPassword, resetPassword, logout, hasPermission }),
    [staff, login, forgotPassword, resetPassword, logout, hasPermission],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = React.useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within an AdminAuthProvider.");
  return ctx;
}
