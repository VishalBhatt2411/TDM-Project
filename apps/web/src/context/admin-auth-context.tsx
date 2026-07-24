import * as React from "react";
import { adminTokenStorage, decodeStaffToken } from "@/lib/admin-token-storage";
import type { StaffTokenPayload } from "@/lib/admin-token-storage";

interface AdminAuthContextValue {
  staff: StaffTokenPayload | null;
  isAuthenticated: boolean;
  loginWithSalesforce: () => void;
  completeLogin: (accessToken: string, refreshToken: string) => void;
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

  const loginWithSalesforce = React.useCallback(() => {
    window.location.href = "/api/v1/admin/auth/salesforce/login";
  }, []);

  const completeLogin = React.useCallback(
    (accessToken: string, refreshToken: string) => {
      applyTokens(accessToken, refreshToken);
    },
    [applyTokens],
  );

  const logout = React.useCallback(() => {
    adminTokenStorage.clear();
    setStaff(null);
  }, []);

  const hasPermission = React.useCallback(
    (key: string) => !!staff && (staff.role === "Admin" || staff.permissions.includes(key)),
    [staff],
  );

  const value = React.useMemo(
    () => ({ staff, isAuthenticated: !!staff, loginWithSalesforce, completeLogin, logout, hasPermission }),
    [staff, loginWithSalesforce, completeLogin, logout, hasPermission],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = React.useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within an AdminAuthProvider.");
  return ctx;
}
