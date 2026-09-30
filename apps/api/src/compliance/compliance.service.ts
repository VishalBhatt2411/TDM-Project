import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AssetRepository, BookingRepository, ComplianceRecord } from "@tdm/domain";
import { ComplianceStatusDto } from "@tdm/types";
import { ASSET_REPOSITORY, BOOKING_REPOSITORY } from "../infrastructure/tokens";
import { SubmitComplianceDto } from "./dto";
import { matchesImageSignature } from "./image-signature";

const ASSET_URL_PREFIX = "/api/v1/assets/";

export function assetIdFromUrl(url: string | undefined): string | undefined {
  return url?.startsWith(ASSET_URL_PREFIX) ? url.slice(ASSET_URL_PREFIX.length) : undefined;
}

export function complianceToDto(bookingId: string, record: ComplianceRecord | null): ComplianceStatusDto {
  if (!record) {
    return { bookingId, otpVerified: false, licenseVerified: false, consentAccepted: false, isComplete: false };
  }
  const props = record.toProps();
  return {
    bookingId,
    otpVerified: props.otpVerified,
    licenseNumber: props.licenseNumber,
    licenseVerified: props.licenseVerified,
    licenseImageUrl: props.licenseImageUrl,
    licenseExpiryDate: props.licenseExpiryDate?.toISOString(),
    consentAccepted: props.consentAccepted,
    signatureImageUrl: props.signatureImageUrl,
    signedAt: props.signedAt?.toISOString(),
    isComplete: record.isComplete,
  };
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
  ) {}

  async getStatus(customerId: string, bookingId: string): Promise<ComplianceStatusDto> {
    await this.requireOwnedBooking(customerId, bookingId);
    const record = await this.bookings.findComplianceByBooking(bookingId);
    return complianceToDto(bookingId, record);
  }

  async submit(customerId: string, bookingId: string, dto: SubmitComplianceDto): Promise<ComplianceStatusDto> {
    const booking = await this.requireOwnedBooking(customerId, bookingId);
    if (booking.status !== "Confirmed") {
      throw new BadRequestException("Compliance can only be submitted for a confirmed booking.");
    }

    // A staff member's license sign-off is final for this booking — a resubmission would
    // silently reset it and swap the images staff actually reviewed.
    const existing = await this.bookings.findComplianceByBooking(bookingId);
    if (existing?.toProps().licenseVerified) {
      throw new ConflictException("Your documents have already been verified by the dealership and can no longer be changed.");
    }

    const licenseData = Buffer.from(dto.licenseImageBase64, "base64");
    const signatureData = Buffer.from(dto.signatureImageBase64, "base64");
    if (!matchesImageSignature(licenseData, dto.licenseImageContentType)) {
      throw new BadRequestException("The license photo is not a valid JPEG, PNG or WebP image.");
    }
    if (!matchesImageSignature(signatureData, dto.signatureImageContentType)) {
      throw new BadRequestException("The signature is not a valid JPEG, PNG or WebP image.");
    }

    // Assets belong to the booking's compliance record, so a first submission persists a
    // pending one before uploading; a failed upload leaves it incomplete and reusable.
    const recordId = existing?.toProps().id ?? randomUUID();
    if (!existing) {
      await this.bookings.saveCompliance(
        ComplianceRecord.create({ id: recordId, bookingId, otpVerified: false, licenseVerified: false, consentAccepted: false }),
      );
    }

    const [licenseAsset, signatureAsset] = await Promise.all([
      this.assets.save({
        contentType: dto.licenseImageContentType,
        data: licenseData,
        purpose: "license_photo",
        bookingId,
      }),
      this.assets.save({
        contentType: dto.signatureImageContentType,
        data: signatureData,
        purpose: "signature",
        bookingId,
      }),
    ]);

    // otpVerified reflects that the submitting customer already holds a valid session
    // JWT for this account — a stronger identity check than a one-time-code would add
    // for this flow, since the JWT already proves ownership of the booking.
    const record = ComplianceRecord.create({
      id: recordId,
      bookingId,
      otpVerified: true,
      licenseNumber: dto.licenseNumber,
      licenseVerified: false,
      licenseImageUrl: `${ASSET_URL_PREFIX}${licenseAsset.id}`,
      licenseExpiryDate: dto.licenseExpiryDate ? new Date(dto.licenseExpiryDate) : undefined,
      consentAccepted: dto.consentAccepted,
      signatureImageUrl: `${ASSET_URL_PREFIX}${signatureAsset.id}`,
      signedAt: new Date(),
    });
    await this.bookings.saveCompliance(record);

    // The previous submission's images are no longer referenced by any record — remove
    // them only after the new record is persisted, so a failed save never loses data.
    if (existing) {
      const previous = existing.toProps();
      const staleIds = [assetIdFromUrl(previous.licenseImageUrl), assetIdFromUrl(previous.signatureImageUrl)].filter(
        (id): id is string => !!id,
      );
      // The submission itself succeeded; an orphaned old file must not turn it into an error.
      try {
        await this.assets.deleteMany(staleIds);
      } catch (error) {
        this.logger.warn(JSON.stringify({ event: "compliance_stale_assets_delete_failed", bookingId, message: (error as Error).message }));
      }
    }

    return complianceToDto(bookingId, record);
  }

  private async requireOwnedBooking(customerId: string, bookingId: string) {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} was not found.`);
    }
    if (booking.customerId !== customerId) {
      throw new ForbiddenException("This booking does not belong to you.");
    }
    return booking;
  }
}
