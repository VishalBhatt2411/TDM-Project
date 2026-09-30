import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { STAFF_ROLES, StaffRole } from "@tdm/domain";
import { IsRecordId } from "../common/record-id";

export class StaffDirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

/** Grants a Salesforce user a role — the user is picked from GET /admin/users/directory. */
export class CreateStaffAssignmentDto {
  @IsRecordId()
  userId!: string;

  @IsIn(STAFF_ROLES)
  role!: StaffRole;

  /** Required for every role except Company_Admin, which spans all dealerships. */
  @IsOptional()
  @IsRecordId()
  dealershipId?: string;

  /** Required for a Sales_Rep — the branch whose bookings they are auto-assigned. */
  @IsOptional()
  @IsRecordId()
  branchId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxDailyBookings?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

/** `null` clears an optional field; an omitted field is left unchanged. The user is fixed for an assignment's life. */
export class UpdateStaffAssignmentDto {
  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsRecordId()
  dealershipId?: string | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsRecordId()
  branchId?: string | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  @Max(100)
  maxDailyBookings?: number | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignSalesRepDto {
  @IsRecordId()
  salesRepId!: string;
}

export class SetStaffNotesDto {
  @IsString()
  notes!: string;
}

export class CheckInBookingDto {
  @IsIn(["QR", "Manual"])
  method!: "QR" | "Manual";

  /** Required when method is "QR" — the signed token read from the customer's check-in code. Verified by QrCheckinService. */
  @IsOptional()
  @IsString()
  qrToken?: string;
}

export class StartDriveDto {
  @IsInt()
  @Min(0)
  odometerStart!: number;
}

export class CompleteDriveDto {
  @IsInt()
  @Min(0)
  odometerEnd!: number;
}
