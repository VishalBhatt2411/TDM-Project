import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { IsRecordId } from "../common/record-id";

const BODY_TYPES = ["Sedan", "SUV", "Hatchback", "Coupe", "Convertible", "Truck", "Van", "Wagon"];
const FUEL_TYPES = ["Petrol", "Diesel", "Electric", "Hybrid", "Plugin_Hybrid", "CNG"];
const TRANSMISSIONS = ["Manual", "Automatic", "CVT", "DCT"];
const FEATURED_KINDS = ["featured", "bestSeller", "newLaunch"] as const;

/** Where the customer is shopping — see the header location picker. */
class VehicleLocationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsRecordId()
  branchId?: string;
}

export class VehicleSearchQueryDto extends VehicleLocationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
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
  @Max(100)
  pageSize?: number;
}

export class FeaturedVehiclesQueryDto extends VehicleLocationQueryDto {
  @IsOptional()
  @IsIn(FEATURED_KINDS)
  kind: (typeof FEATURED_KINDS)[number] = "featured";
}

export class CompareVehiclesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsRecordId({ each: true })
  vehicleIds!: string[];
}

export class EmiEstimateDto {
  @IsNumber()
  @Min(0)
  price!: number;

  @IsNumber()
  @Min(0)
  downPayment!: number;

  @IsInt()
  @Min(1)
  @Max(120)
  tenureMonths!: number;

  @IsNumber()
  @Min(0)
  @Max(50)
  annualInterestRate!: number;
}

export class VehicleAvailabilityQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be in YYYY-MM-DD format." })
  date!: string;
}
