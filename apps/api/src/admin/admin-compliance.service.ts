import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AssetRepository, AuditLogRepository, BookingRepository, CustomerRepository } from "@tdm/domain";
import { ComplianceStatusDto, LicenseAiAssessment } from "@tdm/types";
import { assetIdFromUrl, complianceToDto } from "../compliance/compliance.service";
import { LicenseAiService } from "../compliance/license-ai.service";
import { ASSET_REPOSITORY, AUDIT_LOG_REPOSITORY, BOOKING_REPOSITORY, CUSTOMER_REPOSITORY } from "../infrastructure/tokens";
import { BookingAccessPolicy } from "./booking-access.policy";
import type { AuthenticatedStaff } from "./staff-auth.guard";

@Injectable()
export class AdminComplianceService {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly licenseAi: LicenseAiService,
    private readonly access: BookingAccessPolicy,
  ) {}

  async getStatus(bookingId: string, staff: AuthenticatedStaff): Promise<ComplianceStatusDto> {
    await this.requireAccessibleBooking(bookingId, staff);
    const record = await this.bookings.findComplianceByBooking(bookingId);
    return complianceToDto(bookingId, record);
  }

  async verifyLicense(bookingId: string, staff: AuthenticatedStaff): Promise<LicenseAiAssessment> {
    const booking = await this.requireAccessibleBooking(bookingId, staff);
    const record = await this.bookings.findComplianceByBooking(bookingId);
    if (!record) {
      throw new NotFoundException("No compliance submission exists for this booking yet.");
    }
    const props = record.toProps();
    const licenseAssetId = assetIdFromUrl(props.licenseImageUrl);
    if (!licenseAssetId) {
      throw new BadRequestException("No license image was submitted for this booking.");
    }

    const [asset, customer] = await Promise.all([
      this.assets.findById(licenseAssetId),
      this.customers.findById(booking.customerId),
    ]);
    if (!asset) {
      throw new NotFoundException("The stored license image could not be found.");
    }

    const submittedName = customer ? `${customer.name.firstName} ${customer.name.lastName}` : "";
    const assessment = await this.licenseAi.assess(asset.data, asset.contentType, submittedName, props.licenseNumber ?? "");
    await this.auditLog.append({
      actorId: staff.staffUserId,
      action: "COMPLIANCE_LICENSE_AI_CHECKED",
      entityType: "Booking",
      entityId: bookingId,
      metadata: {},
    });
    return assessment;
  }

  async confirmLicense(bookingId: string, staff: AuthenticatedStaff): Promise<ComplianceStatusDto> {
    await this.requireAccessibleBooking(bookingId, staff);
    const record = await this.bookings.findComplianceByBooking(bookingId);
    if (!record) {
      throw new NotFoundException("No compliance submission exists for this booking yet.");
    }
    record.confirmLicense();
    await this.bookings.saveCompliance(record);
    await this.auditLog.append({
      actorId: staff.staffUserId,
      action: "COMPLIANCE_LICENSE_CONFIRMED",
      entityType: "Booking",
      entityId: bookingId,
      metadata: {},
    });
    return complianceToDto(bookingId, record);
  }

  private async requireAccessibleBooking(bookingId: string, staff: AuthenticatedStaff) {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} was not found.`);
    }
    await this.access.assertCanActOn(staff, booking);
    return booking;
  }
}
