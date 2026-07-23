import { Link, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, LogOut, ShieldCheck, Users, Calendar } from "lucide-react";
import { useAdminAuth } from "@/context/admin-auth-context";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "view_dashboard" },
  { to: "/admin/bookings", label: "Test Drives", icon: Calendar, permission: "manage_bookings" },
  { to: "/admin/users", label: "Users & Permissions", icon: Users, permission: "manage_users" },
];

export function AdminLayout() {
  const { staff, logout, hasPermission } = useAdminAuth();
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="flex w-64 flex-col border-r bg-background">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Admin Console</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.filter((item) => hasPermission(item.permission)).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 px-2 text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{staff?.role}</span>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  );
}
