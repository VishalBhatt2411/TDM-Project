import type { Address, TimeSlot } from "./common";

export type DriveType = "Dealership" | "Home";

export type BookingStatus =
  | "Requested"
  | "Confirmed"
  | "Waitlisted"
  | "InProgress"
  | "Completed"
  | "Cancelled"
  | "NoShow";

export type PurchaseTimeline =
  | "Immediate"
  | "Within_1_Month"
  | "Within_3_Months"
  | "Within_6_Months"
  | "Just_Exploring";

export interface BookingDto {
  id: string;
  customerId: string;
  vehicleId: string;
  branchId: string;
  salesRepId?: string;
  driveType: DriveType;
  slot: TimeSlot;
  status: BookingStatus;
  homeAddress?: Address;
  checkInTimestamp?: string;
  actualStart?: string;
  actualEnd?: string;
  waitlistPosition?: number;
  createdAt: string;
  city?: string;
  state?: string;
  preferredVariantId?: string;
  isExistingCustomer: boolean;
  currentVehicleOwned?: string;
  purchaseTimeline: PurchaseTimeline;
  pickupRequired: boolean;
  additionalNotes?: string;
  /** Internal, staff-only notes — never surfaced to the customer. */
  staffNotes?: string;
}

export interface CreateBookingRequest {
  vehicleId: string;
  preferredVariantId?: string;
  branchId: string;
  driveType: DriveType;
  slot: TimeSlot;
  homeAddress?: Address;
  city?: string;
  state?: string;
  isExistingCustomer?: boolean;
  currentVehicleOwned?: string;
  purchaseTimeline?: PurchaseTimeline;
  pickupRequired?: boolean;
  pickupAddress?: string;
  additionalNotes?: string;
}

/** Booking creation for a first-time visitor — personal info doubles as inline registration. */
export interface CreatePublicBookingRequest extends CreateBookingRequest {
  firstName: string;
  lastName: string;
  email: string;
  /** 10-digit Indian mobile number, no country code — server prefixes +91. */
  mobileNumber: string;
}

export interface CreateBookingResponse extends BookingDto {
  conflictChecked: true;
}

export interface BookingConflictError {
  error: "SLOT_CONFLICT";
  message: string;
  suggestedSlots: string[];
}

export interface RescheduleBookingRequest {
  slot: TimeSlot;
}

export interface CancelBookingRequest {
  reason: string;
}

export interface CheckInRequest {
  method: "QR" | "Manual";
}

export interface StartDriveRequest {
  odometerStart: number;
}

export interface CompleteDriveRequest {
  odometerEnd: number;
}

export interface SetStaffNotesRequest {
  notes: string;
}

export interface HandoffBookingRequest {
  salesRepId: string;
}

export interface ComplianceSubmission {
  otpVerified: boolean;
  licenseNumber: string;
  licenseImageUrl?: string;
  licenseExpiryDate?: string;
  consentAccepted: boolean;
  consentDocumentUrl?: string;
  signatureImageUrl?: string;
}

export type InterestLevel = "Low" | "Medium" | "High";

export interface FeedbackSubmission {
  customerRating?: number;
  customerComments?: string;
  repNotes?: string;
  interestLevel: InterestLevel;
  objectionsRaised?: string;
  submittedBy: "Customer" | "Rep";
  purchaseInterest: boolean;
}

export interface SubmitSurveyRequest {
  vehiclePerformanceRating: number;
  comfortRating: number;
  featuresRating: number;
  staffExperienceRating: number;
  dealershipExperienceRating: number;
  npsScore: number;
  purchaseInterest: boolean;
  additionalComments?: string;
}

export interface CreateOpportunityResponse {
  opportunityId: string;
  stage: "Identified" | "Pursuing" | "Won" | "Lost";
}
