import { CancellationWindowExpiredError, IllegalBookingStateError, InvalidValueError } from "../errors";
import { durationText } from "./booking-schedule";
import { Address, TimeSlot } from "../value-objects";

export type DriveType = "Dealership" | "Home";
export type BookingStatus =
  | "Requested"
  | "Confirmed"
  | "Waitlisted"
  | "InProgress"
  | "Completed"
  | "Cancelled"
  | "NoShow";
export type CheckInMethod = "QR" | "Manual";
export type PurchaseTimeline =
  | "Immediate"
  | "Within_1_Month"
  | "Within_3_Months"
  | "Within_6_Months"
  | "Just_Exploring";

export interface BookingProps {
  id: string;
  customerId: string;
  vehicleId: string;
  /** The dealership of branchId — derived server-side from the branch, never taken from the customer. */
  dealershipId: string;
  branchId: string;
  salesRepId?: string;
  driveType: DriveType;
  slot: TimeSlot;
  status: BookingStatus;
  homeAddress?: Address;
  checkInMethod?: CheckInMethod;
  checkInTimestamp?: Date;
  actualStart?: Date;
  actualEnd?: Date;
  odometerStart?: number;
  odometerEnd?: number;
  cancellationReason?: string;
  rescheduledFromBookingId?: string;
  waitlistPosition?: number;
  createdAt: Date;
  city?: string;
  state?: string;
  preferredVariantId?: string;
  isExistingCustomer: boolean;
  currentVehicleOwned?: string;
  purchaseTimeline: PurchaseTimeline;
  pickupRequired: boolean;
  additionalNotes?: string;
  /** Internal, staff-only notes (visible to the assigned rep and management, never the customer). */
  staffNotes?: string;
}

/** Sentinel id for a Booking that has been requested but not yet assigned an id by the repository. */
export const UNASSIGNED_ID = "__unassigned__";

export class Booking {
  private constructor(private props: BookingProps) {}

  /** id is optional — a new booking has no identity until the repository persists it and assigns one. */
  static request(input: {
    id?: string;
    customerId: string;
    vehicleId: string;
    dealershipId: string;
    branchId: string;
    driveType: DriveType;
    slot: TimeSlot;
    homeAddress?: Address;
    city?: string;
    state?: string;
    preferredVariantId?: string;
    isExistingCustomer?: boolean;
    currentVehicleOwned?: string;
    purchaseTimeline?: PurchaseTimeline;
    pickupRequired?: boolean;
    additionalNotes?: string;
  }): Booking {
    if (input.driveType === "Home" && !input.homeAddress) {
      throw new InvalidValueError("Home address is required for a home test drive.");
    }
    return new Booking({
      id: input.id ?? UNASSIGNED_ID,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      dealershipId: input.dealershipId,
      branchId: input.branchId,
      driveType: input.driveType,
      slot: input.slot,
      homeAddress: input.homeAddress,
      status: "Requested",
      createdAt: new Date(),
      city: input.city,
      state: input.state,
      preferredVariantId: input.preferredVariantId,
      isExistingCustomer: input.isExistingCustomer ?? false,
      currentVehicleOwned: input.currentVehicleOwned,
      purchaseTimeline: input.purchaseTimeline ?? "Just_Exploring",
      pickupRequired: input.pickupRequired ?? false,
      additionalNotes: input.additionalNotes,
    });
  }

  static restore(props: BookingProps): Booking {
    return new Booking(props);
  }

  /** Used by a repository immediately after first insert, to attach the provider-assigned id. */
  withAssignedId(id: string): Booking {
    return Booking.restore({ ...this.props, id });
  }

  get id() {
    return this.props.id;
  }
  get vehicleId() {
    return this.props.vehicleId;
  }
  get branchId() {
    return this.props.branchId;
  }
  get dealershipId() {
    return this.props.dealershipId;
  }
  get customerId() {
    return this.props.customerId;
  }
  get slot() {
    return this.props.slot;
  }
  get status() {
    return this.props.status;
  }
  get salesRepId() {
    return this.props.salesRepId;
  }
  get waitlistPosition() {
    return this.props.waitlistPosition;
  }

  /** Called either right after a conflict-free request, or by WaitlistPromotionService once a slot frees up. */
  confirm(): void {
    if (this.props.status !== "Requested" && this.props.status !== "Waitlisted") {
      throw new IllegalBookingStateError(`Cannot confirm a booking with status "${this.props.status}".`);
    }
    this.props.status = "Confirmed";
    this.props.waitlistPosition = undefined;
  }

  waitlist(position: number): void {
    if (this.props.status !== "Requested") {
      throw new IllegalBookingStateError(`Cannot waitlist a booking with status "${this.props.status}".`);
    }
    this.props.status = "Waitlisted";
    this.props.waitlistPosition = position;
  }

  assignRep(salesRepId: string): void {
    this.props.salesRepId = salesRepId;
  }

  /** `cutoffMinutes` is the dealership's policy for who is changing it — 0 for staff. */
  private assertWithinCancellationWindow(cutoffMinutes: number, asOf: Date): void {
    if (this.props.slot.start.getTime() - asOf.getTime() < cutoffMinutes * 60_000) {
      throw new CancellationWindowExpiredError(
        cutoffMinutes > 0
          ? `Bookings can only be changed at least ${durationText(cutoffMinutes)} before the scheduled start.`
          : "This drive has already started, so it can't be changed.",
      );
    }
  }

  private assertActive(): void {
    if (
      this.props.status === "Completed" ||
      this.props.status === "Cancelled" ||
      this.props.status === "NoShow" ||
      this.props.status === "InProgress"
    ) {
      throw new IllegalBookingStateError(`Cannot modify a booking with status "${this.props.status}".`);
    }
  }

  cancel(reason: string, cutoffMinutes: number, asOf: Date = new Date()): void {
    this.assertActive();
    this.assertWithinCancellationWindow(cutoffMinutes, asOf);
    this.props.status = "Cancelled";
    this.props.cancellationReason = reason;
  }

  reschedule(newSlot: TimeSlot, newBookingId: string, cutoffMinutes: number, asOf: Date = new Date()): Booking {
    this.assertActive();
    this.assertWithinCancellationWindow(cutoffMinutes, asOf);
    this.props.status = "Cancelled";
    this.props.cancellationReason = "Rescheduled";
    return Booking.restore({
      ...this.props,
      id: newBookingId,
      slot: newSlot,
      status: "Requested",
      rescheduledFromBookingId: this.props.id,
      checkInMethod: undefined,
      checkInTimestamp: undefined,
      actualStart: undefined,
      actualEnd: undefined,
      waitlistPosition: undefined,
      createdAt: new Date(),
    });
  }

  /** When check-in opens — `opensMinutes` (the dealership's policy) before the start — and closes, at the slot's end. */
  checkInWindow(opensMinutes: number): { opensAt: Date; closesAt: Date } {
    return { opensAt: new Date(this.props.slot.start.getTime() - opensMinutes * 60_000), closesAt: this.props.slot.end };
  }

  /** Throws unless a confirmed, not-yet-checked-in booking is inside its check-in window. */
  assertCanCheckIn(opensMinutes: number, asOf: Date = new Date()): void {
    if (this.props.status !== "Confirmed") {
      throw new IllegalBookingStateError(`Cannot check in a booking with status "${this.props.status}".`);
    }
    if (this.props.checkInTimestamp) {
      throw new IllegalBookingStateError("This booking has already been checked in.");
    }
    const { opensAt, closesAt } = this.checkInWindow(opensMinutes);
    if (asOf < opensAt) {
      throw new IllegalBookingStateError(
        opensMinutes > 0
          ? `Check-in opens ${durationText(opensMinutes)} before the drive starts.`
          : "Check-in opens when the drive starts.",
      );
    }
    if (asOf >= closesAt) throw new IllegalBookingStateError("This drive's time slot has ended — reschedule it instead.");
  }

  checkIn(method: CheckInMethod, opensMinutes: number, asOf: Date = new Date()): void {
    this.assertCanCheckIn(opensMinutes, asOf);
    this.props.checkInMethod = method;
    this.props.checkInTimestamp = asOf;
  }

  start(odometerStart: number, asOf: Date = new Date()): void {
    if (this.props.status !== "Confirmed" || !this.props.checkInTimestamp) {
      throw new IllegalBookingStateError("A booking must be checked in before the drive can start.");
    }
    this.props.status = "InProgress";
    this.props.actualStart = asOf;
    this.props.odometerStart = odometerStart;
  }

  complete(odometerEnd: number, asOf: Date = new Date()): void {
    if (this.props.status !== "InProgress") {
      throw new IllegalBookingStateError(`Cannot complete a drive that hasn't started (status "${this.props.status}").`);
    }
    if (this.props.odometerStart != null && odometerEnd < this.props.odometerStart) {
      throw new InvalidValueError("The ending odometer reading can't be lower than the starting reading.");
    }
    this.props.status = "Completed";
    this.props.actualEnd = asOf;
    this.props.odometerEnd = odometerEnd;
  }

  markNoShow(): void {
    if (this.props.status !== "Confirmed") {
      throw new IllegalBookingStateError(`Cannot mark a booking with status "${this.props.status}" as a no-show.`);
    }
    if (this.props.checkInTimestamp) {
      throw new IllegalBookingStateError("Cannot mark a booking as a no-show after it has been checked in.");
    }
    this.props.status = "NoShow";
  }

  setStaffNotes(notes: string): void {
    this.props.staffNotes = notes;
  }

  toProps(): BookingProps {
    return { ...this.props };
  }
}

export interface ComplianceRecordProps {
  id: string;
  bookingId: string;
  otpVerified: boolean;
  licenseNumber?: string;
  licenseVerified: boolean;
  licenseImageUrl?: string;
  licenseExpiryDate?: Date;
  consentAccepted: boolean;
  consentDocumentUrl?: string;
  signatureImageUrl?: string;
  signedAt?: Date;
}

export class ComplianceRecord {
  private constructor(private props: ComplianceRecordProps) {}

  static create(props: ComplianceRecordProps): ComplianceRecord {
    return new ComplianceRecord(props);
  }

  get isComplete(): boolean {
    return this.props.otpVerified && this.props.licenseVerified && this.props.consentAccepted;
  }

  /** A staff member's final sign-off after reviewing the AI-assisted license read — see FR-52. The AI extraction/flags are advisory only and never set this on their own. */
  confirmLicense(): void {
    this.props.licenseVerified = true;
  }

  toProps(): ComplianceRecordProps {
    return { ...this.props };
  }
}

export type InterestLevel = "Low" | "Medium" | "High";

export interface DriveFeedbackProps {
  id: string;
  bookingId: string;
  customerRating?: number;
  customerComments?: string;
  repNotes?: string;
  interestLevel: InterestLevel;
  objectionsRaised?: string;
  submittedBy: "Customer" | "Rep";
  purchaseInterest: boolean;
  vehiclePerformanceRating?: number;
  comfortRating?: number;
  featuresRating?: number;
  staffExperienceRating?: number;
  dealershipExperienceRating?: number;
  npsScore?: number;
  isSurveyResponse: boolean;
}

export class DriveFeedback {
  private constructor(private props: DriveFeedbackProps) {}

  static create(props: DriveFeedbackProps): DriveFeedback {
    return new DriveFeedback(props);
  }

  get purchaseInterest() {
    return this.props.purchaseInterest;
  }
  get isSurveyResponse() {
    return this.props.isSurveyResponse;
  }
  get bookingId() {
    return this.props.bookingId;
  }
  get npsScore() {
    return this.props.npsScore;
  }

  /** High purchase intent from a post-drive survey should trigger opportunity creation. */
  get indicatesStrongIntent(): boolean {
    return this.props.purchaseInterest && this.props.interestLevel === "High";
  }

  toProps(): DriveFeedbackProps {
    return { ...this.props };
  }
}
