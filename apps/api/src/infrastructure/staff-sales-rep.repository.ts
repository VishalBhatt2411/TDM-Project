import { BookingRepository, SalesRepRepository, SalesRepresentative } from "@tdm/domain";
import { StaffUserRecord, StaffUserRepository } from "@tdm/postgres-adapter";

function isAssignable(staff: StaffUserRecord): boolean {
  // Only a rep who has actually logged in via Salesforce at least once (salesforceUserId
  // populated just-in-time on first login) has a real Salesforce User id to assign bookings to.
  return staff.role === "SalesRep" && staff.isActive && !!staff.salesforceUserId;
}

function toDomain(staff: StaffUserRecord): SalesRepresentative {
  return SalesRepresentative.restore({
    id: staff.salesforceUserId!,
    name: staff.name,
    email: staff.email,
    phone: staff.phone ?? undefined,
    branchId: staff.branchId ?? undefined,
    isActive: staff.isActive,
    maxDailyBookings: staff.maxDailyBookings ?? undefined,
  });
}

/**
 * Bookings are assigned to a real Salesforce User (Booking__c.OwnerId), and "who is an
 * assignable rep" is governed entirely by this platform's own staff directory (Postgres),
 * not a Salesforce-side object — a SalesRep StaffUser becomes assignable automatically
 * once they've completed their first "Login with Salesforce" (salesforceUserId gets
 * populated then). Composes both STAFF_USER_REPOSITORY (Postgres) and BOOKING_REPOSITORY
 * (Salesforce, for load counts) — that composition belongs here in the infrastructure
 * layer, not inside either single-provider adapter package.
 */
export class StaffSalesRepRepository implements SalesRepRepository {
  constructor(
    private readonly staffUsers: StaffUserRepository,
    private readonly bookings: BookingRepository,
  ) {}

  async findById(salesforceUserId: string): Promise<SalesRepresentative | null> {
    const staff = await this.staffUsers.findBySalesforceUserId(salesforceUserId);
    return staff && isAssignable(staff) ? toDomain(staff) : null;
  }

  async findByBranch(branchId: string): Promise<SalesRepresentative[]> {
    const all = await this.staffUsers.findAll();
    return all.filter((s) => isAssignable(s) && s.branchId === branchId).map(toDomain);
  }

  async findAllActive(): Promise<SalesRepresentative[]> {
    const all = await this.staffUsers.findAll();
    return all.filter(isAssignable).map(toDomain);
  }

  async findLeastLoadedForBranch(branchId: string, onDate: Date): Promise<SalesRepresentative | null> {
    const reps = await this.findByBranch(branchId);
    if (reps.length === 0) return null;

    const loadCounts = await Promise.all(
      reps.map(async (rep) => ({ rep, count: (await this.bookings.findByRepAndDate(rep.id, onDate)).length })),
    );
    const least = loadCounts.reduce((min, curr) => (curr.count < min.count ? curr : min));
    return least.rep;
  }
}
