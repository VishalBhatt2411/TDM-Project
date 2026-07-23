import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { ALL_PERMISSIONS, PermissionKey } from "./permissions";

export class StaffLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class StaffForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class StaffResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class StaffRefreshDto {
  @IsString()
  refreshToken!: string;
}

export class CreateStaffUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsIn(["Admin", "Manager"])
  role!: "Admin" | "Manager";

  @IsOptional()
  @IsArray()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions?: PermissionKey[];
}

export class UpdateStaffUserDto {
  @IsOptional()
  @IsIn(["Admin", "Manager"])
  role?: "Admin" | "Manager";

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
