import { Controller, Get, Inject, NotFoundException, Param, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AssetRepository, BookingRepository } from "@tdm/domain";
import { StaffAuthGuard } from "../admin/staff-auth.guard";
import type { AuthenticatedStaff } from "../admin/staff-auth.guard";
import { CurrentStaff } from "../admin/current-staff.decorator";
import { BookingAccessPolicy } from "../admin/booking-access.policy";
import { ASSET_REPOSITORY, BOOKING_REPOSITORY } from "../infrastructure/tokens";
import { ParseRecordIdPipe } from "../common/record-id";

/**
 * Streams stored compliance images (license photo, canvas-drawn signature) back to the
 * admin console for staff review. Never exposed to customers — they already hold the
 * image locally at capture time.
 *
 * Every asset belongs to a booking; a staff member may only read it if they may act on
 * that booking (BookingAccessPolicy) — the asset id alone is never an authorization.
 */
@Controller("assets")
@UseGuards(StaffAuthGuard)
export class AssetsController {
  constructor(
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    private readonly access: BookingAccessPolicy,
  ) {}

  @Get(":id")
  async getById(@Param("id", ParseRecordIdPipe) id: string, @CurrentStaff() staff: AuthenticatedStaff, @Res() res: Response) {
    const asset = await this.assets.findById(id);
    const booking = asset?.bookingId ? await this.bookings.findById(asset.bookingId) : null;
    if (!asset || !booking) {
      throw new NotFoundException("Asset not found.");
    }
    await this.access.assertCanActOn(staff, booking);
    res.set({ "Content-Type": asset.contentType, "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    res.send(asset.data);
  }
}
