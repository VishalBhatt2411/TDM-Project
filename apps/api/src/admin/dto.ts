import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString } from "class-validator";
import { ALL_PERMISSIONS, PermissionKey } from "./permissions";

export class StaffRefreshDto {
  @IsString()
  refreshToken!: string;
}

export class CreateStaffUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsIn(["Admin", "Manager", "SalesRep"])
  role!: "Admin" | "Manager" | "SalesRep";

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
  @IsIn(["Admin", "Manager", "SalesRep"])
  role?: "Admin" | "Manager" | "SalesRep";

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
