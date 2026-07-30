import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

class TimeSlotDto {
  @IsISO8601()
  start!: string;

  @IsISO8601()
  end!: string;
}

class AddressDto {
  @IsString()
  line1!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsString()
  postalCode!: string;

  @IsString()
  country!: string;
}

const PURCHASE_TIMELINES = ["Immediate", "Within_1_Month", "Within_3_Months", "Within_6_Months", "Just_Exploring"];

export class CreateBookingDto {
  @IsString()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  preferredVariantId?: string;

  @IsString()
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
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsBoolean()
  isExistingCustomer?: boolean;

  @IsOptional()
  @IsString()
  currentVehicleOwned?: string;

  @IsOptional()
  @IsIn(PURCHASE_TIMELINES)
  purchaseTimeline?: string;

  @IsOptional()
  @IsBoolean()
  pickupRequired?: boolean;

  @IsOptional()
  @ValidateIf((o) => o.pickupRequired)
  @IsString()
  pickupAddress?: string;

  @IsOptional()
  @IsString()
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
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEmail()
  email!: string;

  /** 10-digit Indian mobile number, no country code (server prefixes +91). */
  @Matches(/^[6-9]\d{9}$/, { message: "Enter a valid 10-digit Indian mobile number." })
  mobileNumber!: string;
}

export class CancelBookingDto {
  @IsString()
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
  additionalComments?: string;
}
