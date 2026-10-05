import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, LogOut, ShieldCheck, Users, Calendar, ToggleLeft, ScrollText, MapPin, Car, Activity, Mail, Palette } from "lucide-react";
import { useAdminAuth } from "@/context/admin-auth-context";
import { cn } from "@/lib/utils";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { STAFF_ROLE_OPTIONS, staffRoleLabel } from "@/lib/permissions";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: string | null;
  /** Platform-wide pages a dealer-scoped grant of the same permission doesn't reach. */
  companyAdminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "view_dashboard" },
  // No permission gate — every staff role (including a plain SalesRep with no
  // grantable permissions) can at least reach their own scoped "My Test Drives" view.
  { to: "/admin/bookings", label: "Test Drives", icon: Calendar, permission: null },
  { to: "/admin/vehicles", label: "Vehicle Inventory", icon: Car, permission: "manage_config" },
  { to: "/admin/branches", label: "Branches", icon: MapPin, permission: "manage_config" },
  { to: "/admin/users", label: "Users & Permissions", icon: Users, permission: "manage_users" },
  { to: "/admin/branding", label: "Branding & Home Page", icon: Palette, permission: "manage_config" },
  { to: "/admin/notification-templates", label: "Notification Templates", icon: Mail, permission: "manage_config" },
  { to: "/admin/feature-flags", label: "Feature Flags", icon: ToggleLeft, permission: "manage_config" },
  { to: "/admin/audit-log", label: "Audit Log", icon: ScrollText, permission: "view_audit_log" },
  { to: "/admin/system-health", label: "System Health", icon: Activity, permission: "manage_config", companyAdminOnly: true },
];

function canAccess(item: NavItem, hasPermission: (key: string) => boolean, isCompanyAdmin: boolean | undefined) {
  return (!item.permission || hasPermission(item.permission)) && (!item.companyAdminOnly || !!isCompanyAdmin);
}

export function AdminLayout() {
  const { staff, logout, hasPermission } = useAdminAuth();
  const location = useLocation();

  // The nav hides pages a role can't use, but a typed or bookmarked URL must not render them either
  // (the API would 403 every call, leaving an empty or error-filled page).
  const requested = NAV_ITEMS.find((item) => item.to === location.pathname);
  if (requested && !canAccess(requested, hasPermission, staff?.isCompanyAdmin)) {
    return <Navigate to="/admin/bookings" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 md:flex-row">
      <aside className="flex w-full flex-col border-b bg-background md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Admin Console</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-3 md:block md:flex-1 md:space-y-1 md:overflow-visible">
          {NAV_ITEMS.filter((item) => canAccess(item, hasPermission, staff?.isCompanyAdmin)).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
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
            Signed in as <span className="font-medium text-foreground">{staff?.name}</span>
            {staff && <span className="block">{staffRoleLabel(primaryRole(staff.assignments))}</span>}
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-auto">
        <RouteErrorBoundary key={location.pathname}>
          <Outlet />
        </RouteErrorBoundary>
      </main>
    </div>
  );
}

function primaryRole(assignments: { role: string }[]): string {
  return STAFF_ROLE_OPTIONS.find((r) => assignments.some((a) => a.role === r.key))?.key ?? "";
}
