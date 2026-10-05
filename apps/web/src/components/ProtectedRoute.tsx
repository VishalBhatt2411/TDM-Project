import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/auth-context";

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  // Remember where the customer was headed so signing in lands them there, not on a generic page.
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <Outlet />;
}
