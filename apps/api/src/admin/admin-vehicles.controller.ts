import { applyDecorators, BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  AuditLogRepository,
  AvailabilityStatus,
  BodyType,
  BookingRepository,
  Branch,
  BranchRepository,
  FuelType,
  Money,
  Transmission,
  Vehicle,
  VehicleRepository,
  VehicleStatus,
} from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY, BOOKING_REPOSITORY, BRANCH_REPOSITORY, VEHICLE_REPOSITORY } from "../infrastructure/tokens";
import { IsRecordId, ParseRecordIdPipe } from "../common/record-id";
import { vehicleToDto } from "../vehicles/vehicles.service";
import { RegionalSettingsService } from "../config/regional-settings.service";
import { StaffAuthGuard } from "./staff-auth.guard";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { CurrentStaff } from "./current-staff.decorator";
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

const MAX_URL_LENGTH = 2048;
const MAX_LIST_ITEMS = 50;
const LIST_PAGE_SIZE = 200;
const LIST_MAX_PAGES = 50;

/** An http(s) URL, or an empty string — the admin form submits "" for a field left blank. */
const IsHttpUrlOrEmpty = () =>
  applyDecorators(
    ValidateIf((_, value) => value !== undefined && value !== null && value !== ""),
    IsUrl({ protocols: ["http", "https"], require_protocol: true, require_tld: false }),
    MaxLength(MAX_URL_LENGTH),
  );

/** Validates each element of a bounded string list. */
const IsStringList = (maxLength: number) =>
  applyDecorators(IsArray(), ArrayMaxSize(MAX_LIST_ITEMS), IsString({ each: true }), MaxLength(maxLength, { each: true }));

class EngineOptionDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(80) displacement!: string;
  @IsString() @MaxLength(80) power!: string;
  @IsString() @MaxLength(80) torque!: string;
}

class VehicleColorDto {
  @IsString() @MaxLength(80) name!: string;
  @Matches(/^#[0-9a-fA-F]{3,8}$/, { message: "hex must be a CSS hex colour, e.g. #1a2b3c" }) hex!: string;
  @IsOptional() @IsHttpUrlOrEmpty() imageUrl?: string;
}

class VehicleFaqDto {
  @IsString() @MaxLength(300) question!: string;
  @IsString() @MaxLength(2000) answer!: string;
}

class CreateVehicleDto {
  @IsString()
  @MaxLength(80)
  make!: string;

  @IsString()
  @MaxLength(80)
  model!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  trim?: string;

  @IsInt()
  @Min(1900)
  @Max(2100)
  year!: number;

  @IsString()
  @MaxLength(32)
  vin!: string;

  @IsIn(BODY_TYPES)
  bodyType!: string;

  @IsIn(FUEL_TYPES)
  fuelType!: string;

  @IsIn(TRANSMISSIONS)
  transmission!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  color?: string;

  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  priceMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  odometer?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsRecordId()
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
  @Min(1)
  @Max(60)
  seatingCapacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  mileageKmpl?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  safetyRatingStars?: number;

  @IsOptional()
  @IsHttpUrlOrEmpty()
  primaryImageUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true, require_tld: false }, { each: true })
  @MaxLength(MAX_URL_LENGTH, { each: true })
  galleryUrls?: string[];

  @IsOptional()
  @IsHttpUrlOrEmpty()
  videoUrl?: string;

  @IsOptional()
  @IsObject()
  specSheet?: Record<string, string>;

  @IsOptional()
  @IsStringList(200)
  accessories?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => EngineOptionDto)
  engineOptions?: EngineOptionDto[];

  @IsOptional()
  @IsStringList(200)
  safetyFeatures?: string[];

  @IsOptional()
  @IsStringList(200)
  infotainmentFeatures?: string[];

  @IsOptional()
  @IsStringList(200)
  exteriorHighlights?: string[];

  @IsOptional()
  @IsStringList(200)
  interiorHighlights?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => VehicleColorDto)
  colors?: VehicleColorDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => VehicleFaqDto)
  faqs?: VehicleFaqDto[];
}

/** Every field optional — a PATCH only touches the fields the client actually sent. */
class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

/** `currency` is the one the data provider stores prices in — see ProviderRegionalDefaults. */
function toVehicleProps(dto: CreateVehicleDto, currency: string) {
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
    price: Money.create(dto.price, currency),
    priceMax: dto.priceMax != null ? Money.create(dto.priceMax, currency) : undefined,
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
function toVehiclePatch(dto: UpdateVehicleDto, currency: string): Partial<VehicleProps> {
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
        assign("price", Money.create(value as number, currency));
        break;
      case "priceMax":
        assign("priceMax", Money.create(value as number, currency));
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
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    private readonly regional: RegionalSettingsService,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
  ) {}

  @Post()
  async create(@Body() dto: CreateVehicleDto, @CurrentStaffAccess() access: StaffAccess, @CurrentStaff() staff: AuthenticatedStaff) {
    const branch = await this.requireBranch(dto.branchId, access);
    const vehicle = Vehicle.create({ ...toVehicleProps(dto, (await this.regional.resolve(branch.dealershipId)).currencyCode), dealershipId: branch.dealershipId });
    const saved = await this.vehicles.save(vehicle);
    await this.audit(staff, "VEHICLE_CREATED", saved, { make: dto.make, model: dto.model, vin: dto.vin });
    return vehicleToDto(saved);
  }

  @Patch(":id")
  async update(
    @Param("id", ParseRecordIdPipe) id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    const existing = await this.requireVehicle(id, access);
    const { branchId, ...patch } = toVehiclePatch(dto, (await this.regional.resolve(existing.dealershipId)).currencyCode);
    existing.updateDetails(patch);
    if (branchId && branchId !== existing.branchId) {
      const branch = await this.requireBranch(branchId, access);
      existing.moveToBranch(branch.id, branch.dealershipId);
    }
    const saved = await this.vehicles.save(existing);
    await this.audit(staff, "VEHICLE_UPDATED", saved, { changedFields: Object.keys(dto).sort() });
    return vehicleToDto(saved);
  }

  @Delete(":id")
  async remove(
    @Param("id", ParseRecordIdPipe) id: string,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    const vehicle = await this.requireVehicle(id, access);
    // Bookings keep their vehicle for history and reporting, so a booked vehicle is retired, not deleted.
    if (await this.bookings.hasAnyForVehicle(id)) {
      throw new ConflictException("This vehicle has booking history and can't be deleted. Set its status to Sold to retire it instead.");
    }
    await this.vehicles.delete(id);
    await this.audit(staff, "VEHICLE_DELETED", vehicle);
    return { deleted: true };
  }

  @Get()
  async list(@CurrentStaffAccess() access: StaffAccess) {
    const scope = access.scopeFor(PERMISSIONS.MANAGE_CONFIG) ?? { dealershipIds: [] };
    // The console lists the whole inventory in one table, so walk every page rather than silently
    // truncating a large dealership at the first one.
    const all: Vehicle[] = [];
    for (let page = 1; page <= LIST_MAX_PAGES; page++) {
      const { items, total } = await this.vehicles.search({ page, pageSize: LIST_PAGE_SIZE, ...scope });
      all.push(...items);
      if (items.length === 0 || all.length >= total) break;
    }
    return all.map(vehicleToDto);
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

  private audit(staff: AuthenticatedStaff, action: string, vehicle: Vehicle, metadata: Record<string, unknown> = {}) {
    return this.auditLog.append({
      actorId: staff.staffUserId,
      action,
      entityType: "Vehicle",
      entityId: vehicle.id,
      dealershipId: vehicle.dealershipId,
      metadata,
    });
  }

  private async requireVehicle(id: string, access: StaffAccess): Promise<Vehicle> {
    const vehicle = await this.vehicles.findById(id);
    if (!vehicle || !access.canIn(PERMISSIONS.MANAGE_CONFIG, vehicle.dealershipId)) {
      throw new NotFoundException(`Vehicle ${id} not found.`);
    }
    return vehicle;
  }
}
