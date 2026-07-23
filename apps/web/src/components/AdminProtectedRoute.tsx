import { Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "@/context/admin-auth-context";

export function AdminProtectedRoute() {
  const { isAuthenticated } = useAdminAuth();
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  return <Outlet />;
}
