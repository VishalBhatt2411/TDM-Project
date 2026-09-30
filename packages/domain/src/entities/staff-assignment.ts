import { InvalidValueError } from "../errors";
import { UNASSIGNED_ID } from "./booking";

export const STAFF_ROLES = ["Company_Admin", "Dealer_Admin", "Manager", "Sales_Rep"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffAssignmentProps {
  id: string;
  /** The staff member's data-provider user id (a Salesforce User Id) — the same id a Booking is assigned to. */
  userId: string;
  userName?: string;
  userEmail?: string;
  role: StaffRole;
  /** Absent only for a Company Admin, whose access spans every dealership in the tenant. */
  dealershipId?: string;
  /** Required for a Sales Rep — the branch whose bookings they are auto-assigned. */
  branchId?: string;
  isActive: boolean;
  maxDailyBookings?: number;
  phone?: string;
}

/**
 * One grant of staff access: a user holding a role at one dealership (or, for a Company Admin,
 * across all of them). A user may hold one assignment per dealership. Access is derived from
 * the active assignments — there are no per-user permission grants.
 */
export class StaffAssignment {
  private constructor(private props: StaffAssignmentProps) {}

  static restore(props: StaffAssignmentProps): StaffAssignment {
    return new StaffAssignment(props);
  }

  static create(props: Omit<StaffAssignmentProps, "id" | "isActive" | "userName" | "userEmail">): StaffAssignment {
    const assignment = new StaffAssignment({ ...props, id: UNASSIGNED_ID, isActive: true });
    assignment.assertValid();
    return assignment;
  }

  get id() {
    return this.props.id;
  }
  get userId() {
    return this.props.userId;
  }
  get role() {
    return this.props.role;
  }
  get dealershipId() {
    return this.props.dealershipId;
  }
  get branchId() {
    return this.props.branchId;
  }
  get isActive() {
    return this.props.isActive;
  }

  /** The user is fixed for the life of an assignment — re-pointing one to another user would silently move their access. */
  update(patch: Partial<Pick<StaffAssignmentProps, "role" | "dealershipId" | "branchId" | "maxDailyBookings" | "phone" | "isActive">>): void {
    const next = new StaffAssignment({ ...this.props, ...patch });
    next.assertValid();
    this.props = next.props;
  }

  deactivate(): void {
    this.props.isActive = false;
  }

  toProps(): StaffAssignmentProps {
    return { ...this.props };
  }

  /** Mirrors the data provider's own validation so a bad grant is rejected before a round trip. */
  private assertValid(): void {
    const { role, dealershipId, branchId, maxDailyBookings } = this.props;
    if (!STAFF_ROLES.includes(role)) {
      throw new InvalidValueError(`Unknown staff role "${role}".`);
    }
    if (role === "Company_Admin" && dealershipId) {
      throw new InvalidValueError("A Company Admin spans every dealership and must not be tied to one.");
    }
    if (role !== "Company_Admin" && !dealershipId) {
      throw new InvalidValueError("This role requires a dealership.");
    }
    if (role === "Sales_Rep" && !branchId) {
      throw new InvalidValueError("A Sales Rep requires a branch.");
    }
    if (role === "Company_Admin" && branchId) {
      throw new InvalidValueError("A Company Admin must not be tied to a branch.");
    }
    if (maxDailyBookings != null && (!Number.isInteger(maxDailyBookings) || maxDailyBookings < 1)) {
      throw new InvalidValueError("Max daily bookings must be a positive whole number.");
    }
  }
}
