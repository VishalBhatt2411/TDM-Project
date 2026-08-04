import * as React from "react";
import { adminApiClient } from "@/lib/admin-api-client";

export type StaffRole = "Admin" | "Manager" | "SalesRep";

export interface StaffProfile {
  staffUserId: string;
  role: StaffRole;
  permissions: string[];
  /** Sales_Rep__c / Salesforce User id this staff account is linked to — undefined until their first "Login with Salesforce". */
  salesRepId?: string;
}

interface AdminAuthContextValue {
  staff: StaffProfile | null;
  isAuthenticated: boolean;
  /** True until the initial GET /admin/auth/me call resolves — avoids a login-page flash on reload. */
  isLoading: boolean;
  loginWithSalesforce: () => void;
  /** Re-checks session state with the backend. Called on mount and after the OAuth redirect lands. */
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (key: string) => boolean;
}

const AdminAuthContext = React.createContext<AdminAuthContextValue | null>(null);

/**
 * Login status and staff identity are always derived from the backend (GET
 * /admin/auth/me), never from a client-side JWT decode or a URL fragment — the
 * access/refresh tokens live only in HttpOnly cookies the browser manages
 * automatically and this code never touches.
 */
export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = React.useState<StaffProfile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const refreshSession = React.useCallback(async () => {
    try {
      const { data } = await adminApiClient.get<StaffProfile>("/admin/auth/me");
      setStaff(data);
    } catch {
      setStaff(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const loginWithSalesforce = React.useCallback(() => {
    window.location.href = "/api/v1/admin/auth/salesforce/login";
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await adminApiClient.post("/admin/auth/logout");
    } finally {
      setStaff(null);
    }
  }, []);

  const hasPermission = React.useCallback(
    (key: string) => !!staff && (staff.role === "Admin" || staff.permissions.includes(key)),
    [staff],
  );

  const value = React.useMemo(
    () => ({
      staff,
      isAuthenticated: !!staff,
      isLoading,
      loginWithSalesforce,
      refreshSession,
      logout,
      hasPermission,
    }),
    [staff, isLoading, loginWithSalesforce, refreshSession, logout, hasPermission],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = React.useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within an AdminAuthProvider.");
  return ctx;
}
