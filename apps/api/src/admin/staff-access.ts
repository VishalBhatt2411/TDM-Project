import type { DealershipScope, StaffAssignment } from "@tdm/domain";
import type { StaffUserRecord } from "@tdm/postgres-adapter";
import { ALL_PERMISSIONS, PermissionKey, ROLE_PERMISSIONS } from "./permissions";

/**
 * A staff member's effective access, derived from their active staff assignments. The app
 * reads business data as the tenant's integration user (who sees everything), so every
 * admin query must be narrowed by the scope returned here — access is never implicit.
 */
export class StaffAccess {
  constructor(
    readonly staffUser: StaffUserRecord,
    readonly assignments: readonly StaffAssignment[],
  ) {}

  /** The provider user id — the id bookings are assigned to. */
  get salesforceUserId(): string {
    return this.staffUser.salesforceUserId;
  }

  get isCompanyAdmin(): boolean {
    return this.assignments.some((a) => a.role === "Company_Admin");
  }

  get isSalesRep(): boolean {
    return this.assignments.some((a) => a.role === "Sales_Rep");
  }

  /**
   * Where `permission` applies: null when not held at all, an unrestricted scope for a Company
   * Admin, otherwise the dealerships whose assignment's role grants it.
   */
  scopeFor(permission: PermissionKey): DealershipScope | null {
    if (this.isCompanyAdmin) return {};
    const dealershipIds = new Set<string>();
    for (const assignment of this.assignments) {
      if (assignment.dealershipId && ROLE_PERMISSIONS[assignment.role].includes(permission)) {
        dealershipIds.add(assignment.dealershipId);
      }
    }
    return dealershipIds.size ? { dealershipIds: [...dealershipIds] } : null;
  }

  /** Every dealership the user holds any assignment at — unrestricted for a Company Admin. */
  dealershipScope(): DealershipScope {
    if (this.isCompanyAdmin) return {};
    return { dealershipIds: [...new Set(this.assignments.flatMap((a) => (a.dealershipId ? [a.dealershipId] : [])))] };
  }

  can(permission: PermissionKey): boolean {
    return this.scopeFor(permission) !== null;
  }

  canIn(permission: PermissionKey, dealershipId: string): boolean {
    const scope = this.scopeFor(permission);
    return !!scope && (!scope.dealershipIds || scope.dealershipIds.includes(dealershipId));
  }

  permissions(): PermissionKey[] {
    return ALL_PERMISSIONS.filter((permission) => this.can(permission));
  }
}
