import { Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { StaffAuthGuard } from "./staff-auth.guard";
import { AdminComplianceService } from "./admin-compliance.service";
import { CurrentStaff } from "./current-staff.decorator";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { ParseRecordIdPipe } from "../common/record-id";

/**
 * Staff review of a booking's pre-drive compliance record: reading the submitted
 * license/signature, running the advisory AI license read, and the human sign-off
 * that actually sets ComplianceRecord.licenseVerified — see FR-52. Access follows the
 * same per-booking rule as every other admin booking action (BookingAccessPolicy).
 */
@Controller("admin/bookings/:id/compliance")
@UseGuards(StaffAuthGuard)
export class AdminComplianceController {
  constructor(private readonly adminCompliance: AdminComplianceService) {}

  @Get()
  getStatus(@Param("id", ParseRecordIdPipe) bookingId: string, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminCompliance.getStatus(bookingId, staff);
  }

  @Post("verify-license")
  verifyLicense(@Param("id", ParseRecordIdPipe) bookingId: string, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminCompliance.verifyLicense(bookingId, staff);
  }

  @Patch("confirm-license")
  confirmLicense(@Param("id", ParseRecordIdPipe) bookingId: string, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminCompliance.confirmLicense(bookingId, staff);
  }
}
