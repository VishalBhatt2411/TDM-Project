/**
 * Permission keys an Admin can grant to a Manager. "Admin" role always has every
 * permission implicitly (see PermissionGuard) — the permissions array only matters
 * for non-Admin staff.
 */
export const PERMISSIONS = {
  MANAGE_USERS: "manage_users",
  MANAGE_BOOKINGS: "manage_bookings",
  VIEW_DASHBOARD: "view_dashboard",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);
