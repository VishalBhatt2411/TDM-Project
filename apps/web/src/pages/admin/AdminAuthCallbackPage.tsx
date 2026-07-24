import * as React from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuth } from "@/context/admin-auth-context";

/**
 * Landing point for Salesforce's OAuth redirect. Tokens arrive in the URL
 * fragment (never a query string, so they never hit server access logs);
 * a provisioning/activation failure arrives as ?error=... instead.
 */
export function AdminAuthCallbackPage() {
  const { completeLogin } = useAdminAuth();
  const [status, setStatus] = React.useState<"pending" | "done" | "error">("pending");
  const [error, setError] = React.useState("invalid_state");

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramError = params.get("error");
    if (paramError) {
      setError(paramError);
      setStatus("error");
      return;
    }

    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = fragment.get("accessToken");
    const refreshToken = fragment.get("refreshToken");
    if (accessToken && refreshToken) {
      completeLogin(accessToken, refreshToken);
      setStatus("done");
    } else {
      setStatus("error");
    }
  }, [completeLogin]);

  if (status === "done") return <Navigate to="/admin" replace />;
  if (status === "error") return <Navigate to={`/admin/login?error=${error}`} replace />;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
