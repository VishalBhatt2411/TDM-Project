import type { StaffRole } from "@tdm/domain";

/**
 * What a staff member may do. Never granted per user: every permission is derived from the
 * roles in their active staff assignments (ROLE_PERMISSIONS), each limited to that
 * assignment's dealership — see StaffAccess.
 */
export const PERMISSIONS = {
  MANAGE_USERS: "manage_users",
  MANAGE_BOOKINGS: "manage_bookings",
  VIEW_DASHBOARD: "view_dashboard",
  MANAGE_CONFIG: "manage_config",
  VIEW_AUDIT_LOG: "view_audit_log",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

/**
 * A Company Admin holds every permission across every dealership. The other roles hold theirs
 * only at the assignment's dealership. A Sales Rep has no console permissions — they act only
 * on test drives assigned to them (see BookingAccessPolicy). A Dealer Admin manages config only at
 * their own dealerships — every MANAGE_CONFIG endpoint narrows to scopeFor/canIn, and company-wide
 * settings need an unrestricted grant (ConfigScopeResolver). The audit log and system health stay
 * Company-Admin-only because they span dealerships.
 */
export const ROLE_PERMISSIONS: Record<StaffRole, readonly PermissionKey[]> = {
  Company_Admin: ALL_PERMISSIONS,
  Dealer_Admin: [PERMISSIONS.MANAGE_USERS, PERMISSIONS.MANAGE_BOOKINGS, PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.MANAGE_CONFIG],
  Manager: [PERMISSIONS.MANAGE_BOOKINGS, PERMISSIONS.VIEW_DASHBOARD],
  Sales_Rep: [],
};
