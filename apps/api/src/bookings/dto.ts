import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type { PurchaseTimeline } from "@tdm/types";
import { IsRecordId } from "../common/record-id";

/** Full ISO-8601 instants only — a bare date or a zone-less time would be read in the server's zone, not the dealership's. */
const ISO_INSTANT = { strict: true, strictSeparator: true } as const;

class TimeSlotDto {
  @IsISO8601(ISO_INSTANT)
  start!: string;

  @IsISO8601(ISO_INSTANT)
  end!: string;
}

class AddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  line1!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country!: string;
}

const PURCHASE_TIMELINES: readonly PurchaseTimeline[] = ["Immediate", "Within_1_Month", "Within_3_Months", "Within_6_Months", "Just_Exploring"];

export class CreateBookingDto {
  @IsRecordId()
  vehicleId!: string;

  @IsOptional()
  @IsRecordId()
  preferredVariantId?: string;

  /** Must be the vehicle's own branch (see BookingsService.createBookingInternal). */
  @IsRecordId()
  branchId!: string;

  @IsIn(["Dealership", "Home"])
  driveType!: "Dealership" | "Home";

  @ValidateNested()
  @Type(() => TimeSlotDto)
  slot!: TimeSlotDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  homeAddress?: AddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsBoolean()
  isExistingCustomer?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentVehicleOwned?: string;

  @IsOptional()
  @IsIn(PURCHASE_TIMELINES)
  purchaseTimeline?: PurchaseTimeline;

  @IsOptional()
  @IsBoolean()
  pickupRequired?: boolean;

  @IsOptional()
  @ValidateIf((o) => o.pickupRequired)
  @IsString()
  @MaxLength(500)
  pickupAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalNotes?: string;

  /** If the requested slot conflicts with an existing booking, join the vehicle's waitlist instead of failing outright. */
  @IsOptional()
  @IsBoolean()
  joinWaitlistIfUnavailable?: boolean;
}

/**
 * Booking creation for a first-time/anonymous visitor: the personal-info fields
 * double as an inline registration — no separate register/login step required.
 * See BookingsService.createPublic for the account matching/creation logic.
 */
export class CreatePublicBookingDto extends CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  /**
   * International ("+<code><number>") or national — the server prefixes the dealership's
   * calling code to a national number, and rejects one when the dealership has none set.
   */
  @Matches(/^\+?[\d\s().-]{6,24}$/, { message: "Enter a valid mobile number." })
  mobileNumber!: string;
}

export class CancelBookingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class RescheduleBookingDto {
  @ValidateNested()
  @Type(() => TimeSlotDto)
  slot!: TimeSlotDto;
}

export class SubmitSurveyDto {
  @IsInt()
  @Min(1)
  @Max(5)
  vehiclePerformanceRating!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  comfortRating!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  featuresRating!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  staffExperienceRating!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  dealershipExperienceRating!: number;

  @IsInt()
  @Min(0)
  @Max(10)
  npsScore!: number;

  @IsBoolean()
  purchaseInterest!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalComments?: string;
}
