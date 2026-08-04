import { CancellationWindowExpiredError } from "../errors";
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
}

/** How long before the scheduled start a customer may still cancel/reschedule for free. */
const CANCELLATION_CUTOFF_HOURS = 2;

/** Sentinel id for a Booking that has been requested but not yet assigned an id by the repository. */
export const UNASSIGNED_ID = "__unassigned__";

export class Booking {
  private constructor(private props: BookingProps) {}

  /** id is optional — a new booking has no identity until the repository persists it and assigns one. */
  static request(input: {
    id?: string;
    customerId: string;
    vehicleId: string;
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
      throw new Error("Home address is required for a home test drive.");
    }
    return new Booking({
      id: input.id ?? UNASSIGNED_ID,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
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

  confirm(): void {
    this.props.status = "Confirmed";
  }

  waitlist(position: number): void {
    this.props.status = "Waitlisted";
    this.props.waitlistPosition = position;
  }

  assignRep(salesRepId: string): void {
    this.props.salesRepId = salesRepId;
  }

  private assertWithinCancellationWindow(asOf: Date): void {
    const cutoffMs = CANCELLATION_CUTOFF_HOURS * 60 * 60 * 1000;
    if (this.props.slot.start.getTime() - asOf.getTime() < cutoffMs) {
      throw new CancellationWindowExpiredError(
        `Bookings can only be changed at least ${CANCELLATION_CUTOFF_HOURS} hours before the scheduled start.`,
      );
    }
  }

  cancel(reason: string, asOf: Date = new Date()): void {
    this.assertWithinCancellationWindow(asOf);
    this.props.status = "Cancelled";
    this.props.cancellationReason = reason;
  }

  reschedule(newSlot: TimeSlot, newBookingId: string, asOf: Date = new Date()): Booking {
    this.assertWithinCancellationWindow(asOf);
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

  checkIn(method: CheckInMethod, asOf: Date = new Date()): void {
    this.props.checkInMethod = method;
    this.props.checkInTimestamp = asOf;
  }

  start(odometerStart: number, asOf: Date = new Date()): void {
    this.props.status = "InProgress";
    this.props.actualStart = asOf;
    this.props.odometerStart = odometerStart;
  }

  complete(odometerEnd: number, asOf: Date = new Date()): void {
    this.props.status = "Completed";
    this.props.actualEnd = asOf;
    this.props.odometerEnd = odometerEnd;
  }

  markNoShow(): void {
    this.props.status = "NoShow";
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
