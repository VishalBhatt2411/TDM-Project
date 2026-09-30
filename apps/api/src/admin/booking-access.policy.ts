import { ForbiddenException, Injectable } from "@nestjs/common";
import { Booking } from "@tdm/domain";
import { PERMISSIONS } from "./permissions";
import type { StaffAccess } from "./staff-access";
import { StaffAccessService } from "./staff-access.service";
import type { AuthenticatedStaff } from "./staff-auth.guard";

/**
 * Single source of truth for "may this staff member act on this booking?" — shared by
 * every per-booking admin action (lifecycle transitions, compliance review) so the rule
 * can't drift between features.
 *
 * Staff holding MANAGE_BOOKINGS at the booking's dealership may act on it; a Sales Rep only
 * on bookings currently assigned to them. Access is resolved from live staff assignments
 * (see StaffAccessService), never from the JWT.
 */
@Injectable()
export class BookingAccessPolicy {
  constructor(private readonly staffAccess: StaffAccessService) {}

  async assertCanActOn(staff: AuthenticatedStaff, booking: Booking): Promise<StaffAccess> {
    const access = await this.staffAccess.resolve(staff);
    if (access && this.canActOn(access, booking)) return access;
    throw new ForbiddenException("You can only act on test drives assigned to you.");
  }

  canActOn(access: StaffAccess, booking: Booking): boolean {
    if (access.canIn(PERMISSIONS.MANAGE_BOOKINGS, booking.dealershipId)) return true;
    return access.isSalesRep && booking.salesRepId === access.salesforceUserId;
  }
}
