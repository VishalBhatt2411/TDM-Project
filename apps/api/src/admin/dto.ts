import { IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { StaffRole } from "@tdm/postgres-adapter";
import { ALL_PERMISSIONS, PermissionKey } from "./permissions";

export class CreateStaffUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsEnum(StaffRole)
  role!: StaffRole;

  @IsOptional()
  @IsArray()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions?: PermissionKey[];

  /** Dealership profile fields, relevant for a "SalesRep" role — bookings assign to their real Salesforce login once they've signed in once. */
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDailyBookings?: number;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateStaffUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;

  @IsOptional()
  @IsArray()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions?: PermissionKey[];

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDailyBookings?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignSalesRepDto {
  @IsString()
  salesRepId!: string;
}

export class SetStaffNotesDto {
  @IsString()
  notes!: string;
}

export class CheckInBookingDto {
  @IsIn(["QR", "Manual"])
  method!: "QR" | "Manual";
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
