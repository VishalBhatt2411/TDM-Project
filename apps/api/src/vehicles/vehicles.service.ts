import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Vehicle, VehicleRepository, VehicleVariant, VehicleVariantRepository } from "@tdm/domain";
import { EmiEstimateRequest, EmiEstimateResponse, Paginated, VehicleDto, VehicleVariantDto } from "@tdm/types";
import { VEHICLE_REPOSITORY, VEHICLE_VARIANT_REPOSITORY } from "../infrastructure/tokens";
import { VehicleSearchQueryDto } from "./dto";

function toDto(vehicle: Vehicle): VehicleDto {
  const props = vehicle.toProps();
  return {
    id: props.id,
    make: props.make,
    model: props.model,
    trim: props.trim,
    year: props.year,
    vin: props.vin,
    bodyType: props.bodyType,
    fuelType: props.fuelType,
    transmission: props.transmission,
    color: props.color,
    price: { amount: props.price.amount, currency: props.price.currency },
    priceMax: props.priceMax ? { amount: props.priceMax.amount, currency: props.priceMax.currency } : undefined,
    odometer: props.odometer,
    status: props.status,
    branchId: props.branchId,
    isFeatured: props.isFeatured,
    isBestSeller: props.isBestSeller,
    isNewLaunch: props.isNewLaunch,
    availabilityStatus: props.availabilityStatus,
    seatingCapacity: props.seatingCapacity,
    mileageKmpl: props.mileageKmpl,
    safetyRatingStars: props.safetyRatingStars,
    primaryImageUrl: props.primaryImageUrl,
    galleryUrls: props.galleryUrls,
    videoUrl: props.videoUrl,
    specSheet: props.specSheet,
    accessories: props.accessories,
    description: props.description,
    engineOptions: props.engineOptions,
    safetyFeatures: props.safetyFeatures,
    infotainmentFeatures: props.infotainmentFeatures,
    exteriorHighlights: props.exteriorHighlights,
    interiorHighlights: props.interiorHighlights,
    colors: props.colors,
    faqs: props.faqs,
  };
}

function variantToDto(variant: VehicleVariant): VehicleVariantDto {
  const props = variant.toProps();
  return {
    id: props.id,
    vehicleId: props.vehicleId,
    name: props.name,
    price: { amount: props.price.amount, currency: props.price.currency },
    engine: props.engine,
    fuelType: props.fuelType,
    transmission: props.transmission,
    isDefault: props.isDefault,
    displayOrder: props.displayOrder,
  };
}

@Injectable()
export class VehiclesService {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(VEHICLE_VARIANT_REPOSITORY) private readonly variants: VehicleVariantRepository,
  ) {}

  async search(query: VehicleSearchQueryDto): Promise<Paginated<VehicleDto>> {
    const { items, total } = await this.vehicles.search(query);
    return {
      items: items.map(toDto),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  async getById(id: string): Promise<VehicleDto> {
    const vehicle = await this.vehicles.findById(id);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${id} was not found.`);
    }
    return toDto(vehicle);
  }

  async compare(ids: string[]): Promise<VehicleDto[]> {
    const vehicles = await Promise.all(ids.map((id) => this.vehicles.findById(id)));
    return vehicles.filter((v): v is Vehicle => v !== null).map(toDto);
  }

  async getFeatured(kind: "featured" | "bestSeller" | "newLaunch", limit?: number): Promise<VehicleDto[]> {
    const vehicles = await this.vehicles.findFeatured(kind, limit);
    return vehicles.map(toDto);
  }

  async getRelated(id: string, limit?: number): Promise<VehicleDto[]> {
    const vehicles = await this.vehicles.findRelated(id, limit);
    return vehicles.map(toDto);
  }

  async getVariants(vehicleId: string): Promise<VehicleVariantDto[]> {
    const variants = await this.variants.findByVehicle(vehicleId);
    return variants.map(variantToDto);
  }

  estimateEmi(request: EmiEstimateRequest): EmiEstimateResponse {
    const principal = request.price - request.downPayment;
    const monthlyRate = request.annualInterestRate / 12 / 100;
    const n = request.tenureMonths;

    if (principal <= 0 || n <= 0) {
      return { monthlyPayment: 0, totalInterest: 0, totalPayment: 0 };
    }
    const monthlyPayment =
      monthlyRate === 0
        ? principal / n
        : (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);

    const totalPayment = monthlyPayment * n;
    const totalInterest = totalPayment - principal;

    return {
      monthlyPayment: round2(monthlyPayment),
      totalInterest: round2(totalInterest),
      totalPayment: round2(totalPayment + request.downPayment),
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
