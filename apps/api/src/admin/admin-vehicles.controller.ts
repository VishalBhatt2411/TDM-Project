import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { PartialType } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Min } from "class-validator";
import {
  AvailabilityStatus,
  BodyType,
  Branch,
  BranchRepository,
  FuelType,
  Money,
  Transmission,
  Vehicle,
  VehicleRepository,
  VehicleStatus,
} from "@tdm/domain";
import { BRANCH_REPOSITORY, VEHICLE_REPOSITORY } from "../infrastructure/tokens";
import { ParseRecordIdPipe } from "../common/record-id";
import { vehicleToDto } from "../vehicles/vehicles.service";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { PERMISSIONS } from "./permissions";

const BODY_TYPES = ["Sedan", "SUV", "Hatchback", "Coupe", "Convertible", "Truck", "Van", "Wagon", "MPV", "Pickup", "Luxury"];
const FUEL_TYPES = ["Petrol", "Diesel", "Electric", "Hybrid", "Plugin_Hybrid", "CNG"];
const TRANSMISSIONS = ["Manual", "Automatic", "CVT", "DCT"];
const STATUSES = ["Available", "Reserved", "In_Drive", "Maintenance", "Sold"];
const AVAILABILITY_STATUSES = ["In_Stock", "Limited_Stock", "On_Request", "Coming_Soon"];

class CreateVehicleDto {
  @IsString()
  make!: string;

  @IsString()
  model!: string;

  @IsOptional()
  @IsString()
  trim?: string;

  @IsInt()
  year!: number;

  @IsString()
  vin!: string;

  @IsIn(BODY_TYPES)
  bodyType!: string;

  @IsIn(FUEL_TYPES)
  fuelType!: string;

  @IsIn(TRANSMISSIONS)
  transmission!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  odometer?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsString()
  branchId!: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isBestSeller?: boolean;

  @IsOptional()
  @IsBoolean()
  isNewLaunch?: boolean;

  @IsOptional()
  @IsIn(AVAILABILITY_STATUSES)
  availabilityStatus?: string;

  @IsOptional()
  @IsInt()
  seatingCapacity?: number;

  @IsOptional()
  @IsNumber()
  mileageKmpl?: number;

  @IsOptional()
  @IsInt()
  safetyRatingStars?: number;

  @IsOptional()
  @IsString()
  primaryImageUrl?: string;

  @IsOptional()
  @IsArray()
  galleryUrls?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsObject()
  specSheet?: Record<string, string>;

  @IsOptional()
  @IsArray()
  accessories?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  engineOptions?: { name: string; displacement: string; power: string; torque: string }[];

  @IsOptional()
  @IsArray()
  safetyFeatures?: string[];

  @IsOptional()
  @IsArray()
  infotainmentFeatures?: string[];

  @IsOptional()
  @IsArray()
  exteriorHighlights?: string[];

  @IsOptional()
  @IsArray()
  interiorHighlights?: string[];

  @IsOptional()
  @IsArray()
  colors?: { name: string; hex: string; imageUrl?: string }[];

  @IsOptional()
  @IsArray()
  faqs?: { question: string; answer: string }[];
}

/** Every field optional — a PATCH only touches the fields the client actually sent. */
class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

function toVehicleProps(dto: CreateVehicleDto) {
  return {
    make: dto.make,
    model: dto.model,
    trim: dto.trim,
    year: dto.year,
    vin: dto.vin,
    bodyType: dto.bodyType as BodyType,
    fuelType: dto.fuelType as FuelType,
    transmission: dto.transmission as Transmission,
    color: dto.color,
    price: Money.create(dto.price, "INR"),
    priceMax: dto.priceMax != null ? Money.create(dto.priceMax, "INR") : undefined,
    odometer: dto.odometer ?? 0,
    status: (dto.status ?? "Available") as VehicleStatus,
    branchId: dto.branchId,
    isFeatured: dto.isFeatured ?? false,
    isBestSeller: dto.isBestSeller ?? false,
    isNewLaunch: dto.isNewLaunch ?? false,
    availabilityStatus: (dto.availabilityStatus ?? "In_Stock") as AvailabilityStatus,
    seatingCapacity: dto.seatingCapacity,
    mileageKmpl: dto.mileageKmpl,
    safetyRatingStars: dto.safetyRatingStars,
    primaryImageUrl: dto.primaryImageUrl,
    galleryUrls: dto.galleryUrls ?? [],
    videoUrl: dto.videoUrl,
    specSheet: dto.specSheet ?? {},
    accessories: dto.accessories ?? [],
    description: dto.description,
    engineOptions: dto.engineOptions ?? [],
    safetyFeatures: dto.safetyFeatures ?? [],
    infotainmentFeatures: dto.infotainmentFeatures ?? [],
    exteriorHighlights: dto.exteriorHighlights ?? [],
    interiorHighlights: dto.interiorHighlights ?? [],
    colors: dto.colors ?? [],
    faqs: dto.faqs ?? [],
  };
}

type VehicleProps = ReturnType<typeof toVehicleProps>;

/** Optional scalar fields a client may explicitly clear on update by sending `null`. */
const CLEARABLE_FIELDS = new Set<keyof VehicleProps>([
  "trim",
  "color",
  "priceMax",
  "seatingCapacity",
  "mileageKmpl",
  "safetyRatingStars",
  "primaryImageUrl",
  "videoUrl",
  "description",
]);

/**
 * Maps only the keys present on a partial update, so omitted rich content (gallery,
 * spec sheet, FAQs, ...) is preserved rather than reset to the create-time defaults.
 */
function toVehiclePatch(dto: UpdateVehicleDto): Partial<VehicleProps> {
  const patch: Partial<VehicleProps> = {};
  const assign = <K extends keyof VehicleProps>(key: K, value: VehicleProps[K]) => {
    patch[key] = value;
  };
  for (const [key, value] of Object.entries(dto) as [keyof UpdateVehicleDto, unknown][]) {
    if (value === undefined) continue;
    if (value === null) {
      // IsOptional() lets null through validation; only genuinely optional fields may be cleared.
      if (CLEARABLE_FIELDS.has(key)) assign(key, undefined as VehicleProps[typeof key]);
      continue;
    }
    switch (key) {
      case "price":
        assign("price", Money.create(value as number, "INR"));
        break;
      case "priceMax":
        assign("priceMax", Money.create(value as number, "INR"));
        break;
      default:
        assign(key, value as VehicleProps[typeof key]);
    }
  }
  return patch;
}

@Controller("admin/vehicles")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class AdminVehiclesController {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
  ) {}

  @Post()
  async create(@Body() dto: CreateVehicleDto, @CurrentStaffAccess() access: StaffAccess) {
    const branch = await this.requireBranch(dto.branchId, access);
    const vehicle = Vehicle.create({ ...toVehicleProps(dto), dealershipId: branch.dealershipId });
    const saved = await this.vehicles.save(vehicle);
    return vehicleToDto(saved);
  }

  @Patch(":id")
  async update(
    @Param("id", ParseRecordIdPipe) id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentStaffAccess() access: StaffAccess,
  ) {
    const existing = await this.requireVehicle(id, access);
    const { branchId, ...patch } = toVehiclePatch(dto);
    existing.updateDetails(patch);
    if (branchId && branchId !== existing.branchId) {
      const branch = await this.requireBranch(branchId, access);
      existing.moveToBranch(branch.id, branch.dealershipId);
    }
    const saved = await this.vehicles.save(existing);
    return vehicleToDto(saved);
  }

  @Delete(":id")
  async remove(@Param("id", ParseRecordIdPipe) id: string, @CurrentStaffAccess() access: StaffAccess) {
    await this.requireVehicle(id, access);
    await this.vehicles.delete(id);
    return { deleted: true };
  }

  @Get()
  async list(@CurrentStaffAccess() access: StaffAccess) {
    const scope = access.scopeFor(PERMISSIONS.MANAGE_CONFIG) ?? { dealershipIds: [] };
    const { items } = await this.vehicles.search({ pageSize: 200, ...scope });
    return items.map(vehicleToDto);
  }

  /**
   * A vehicle's dealership always follows its branch, so the branch must be real — and one the
   * admin manages. Another dealership's branch is indistinguishable from a nonexistent one.
   */
  private async requireBranch(branchId: string, access: StaffAccess): Promise<Branch> {
    const branch = await this.branches.findById(branchId);
    if (!branch || !access.canIn(PERMISSIONS.MANAGE_CONFIG, branch.dealershipId)) {
      throw new BadRequestException("Unknown branch.");
    }
    return branch;
  }

  private async requireVehicle(id: string, access: StaffAccess): Promise<Vehicle> {
    const vehicle = await this.vehicles.findById(id);
    if (!vehicle || !access.canIn(PERMISSIONS.MANAGE_CONFIG, vehicle.dealershipId)) {
      throw new NotFoundException(`Vehicle ${id} not found.`);
    }
    return vehicle;
  }
}
