import { IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString } from "class-validator";
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
  @IsBoolean()
  isActive?: boolean;
}

export class AssignSalesRepDto {
  @IsString()
  salesRepId!: string;
}
