import { Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "@/context/admin-auth-context";

export function AdminProtectedRoute() {
  const { isAuthenticated, isLoading } = useAdminAuth();
  // Wait for the initial GET /admin/auth/me to resolve before deciding — otherwise
  // a page reload would flash-redirect to /admin/login before the session check
  // (which relies on the HttpOnly cookie the browser already has) completes.
  if (isLoading) return null;
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  return <Outlet />;
}
