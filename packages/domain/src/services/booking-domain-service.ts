import { Booking } from "../entities/booking";
import { BookingConflictError } from "../errors";
import { BookingRepository } from "../repositories";
import { TimeSlot } from "../value-objects";

/**
 * Checks whether a proposed slot for a vehicle overlaps an existing active booking.
 * Lives in the domain layer (not the adapter) so the conflict rule is identical
 * regardless of which provider persists bookings.
 */
export class BookingConflictChecker {
  constructor(private readonly bookings: BookingRepository) {}

  /** `ignoreBookingId` is the booking being moved, which must not collide with its own current slot. */
  async assertNoConflict(vehicleId: string, slot: TimeSlot, ignoreBookingId?: string): Promise<void> {
    const active = (await this.bookings.findActiveByVehicle(vehicleId)).filter((b) => b.id !== ignoreBookingId);
    const conflicting = active.find((b) => b.slot.overlaps(slot));
    if (conflicting) {
      const suggested = this.suggestAlternativeSlots(slot, active);
      throw new BookingConflictError(
        "This vehicle is already booked for an overlapping time.",
        suggested.map((s) => s.toJSON().start),
      );
    }
  }

  private suggestAlternativeSlots(requested: TimeSlot, existing: Booking[]): TimeSlot[] {
    const durationMs = requested.end.getTime() - requested.start.getTime();
    const suggestions: TimeSlot[] = [];
    let candidateStart = requested.end;
    for (let i = 0; i < 3; i++) {
      const candidateEnd = new Date(candidateStart.getTime() + durationMs);
      const candidate = TimeSlot.create(candidateStart, candidateEnd);
      const overlaps = existing.some((b) => b.slot.overlaps(candidate));
      if (!overlaps) suggestions.push(candidate);
      candidateStart = candidateEnd;
    }
    return suggestions;
  }
}

/**
 * Promotes the next waitlisted booking (FIFO by waitlistPosition) once a vehicle's
 * active booking is cancelled/completed and a slot is free. Only a waitlisted booking whose own
 * slot is still ahead and no longer overlaps an active booking is eligible — a slot freed elsewhere
 * in the day says nothing about whether this one is now open.
 */
export class WaitlistPromotionService {
  constructor(private readonly bookings: BookingRepository) {}

  async promoteNextFor(vehicleId: string, asOf: Date = new Date()): Promise<Booking | null> {
    const waitlisted = (await this.bookings.findWaitlistedForVehicle(vehicleId))
      .filter((b) => b.slot.start > asOf)
      .sort((a, b) => (a.waitlistPosition ?? Infinity) - (b.waitlistPosition ?? Infinity));
    if (waitlisted.length === 0) return null;

    const active = await this.bookings.findActiveByVehicle(vehicleId);
    const next = waitlisted.find((candidate) => !active.some((b) => b.id !== candidate.id && b.slot.overlaps(candidate.slot)));
    if (!next) return null;

    next.confirm();
    await this.bookings.save(next);
    return next;
  }
}
