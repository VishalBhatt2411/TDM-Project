import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

const BODY_TYPES = ["Sedan", "SUV", "Hatchback", "Coupe", "Convertible", "Truck", "Van", "Wagon"];
const FUEL_TYPES = ["Petrol", "Diesel", "Electric", "Hybrid", "Plugin_Hybrid", "CNG"];
const TRANSMISSIONS = ["Manual", "Automatic", "CVT", "DCT"];

export class VehicleSearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(BODY_TYPES)
  bodyType?: string;

  @IsOptional()
  @IsIn(FUEL_TYPES)
  fuelType?: string;

  @IsOptional()
  @IsIn(TRANSMISSIONS)
  transmission?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
