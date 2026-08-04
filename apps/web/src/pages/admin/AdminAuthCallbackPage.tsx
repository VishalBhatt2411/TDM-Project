import * as React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAdminAuth } from "@/context/admin-auth-context";

/**
 * Landing point for Salesforce's OAuth redirect. The backend has already set the
 * staff auth cookies (HttpOnly — this page never sees or handles a token) before
 * redirecting here on success, or appended `?error=...` on failure. This page's
 * only job is to ask the backend "am I logged in now?" and route accordingly.
 */
export function AdminAuthCallbackPage() {
  const { refreshSession, isAuthenticated } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    if (error) return;
    refreshSession().finally(() => setChecked(true));
  }, [error, refreshSession]);

  if (error) return <Navigate to={`/admin/login?error=${error}`} replace />;
  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    );
  }
  return <Navigate to={isAuthenticated ? "/admin" : "/admin/login?error=exchange_failed"} replace />;
}
