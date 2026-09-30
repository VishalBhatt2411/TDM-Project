import { Money } from "../value-objects";
import { UNASSIGNED_ID } from "./booking";

export type BodyType =
  | "Sedan"
  | "SUV"
  | "Hatchback"
  | "Coupe"
  | "Convertible"
  | "Truck"
  | "Van"
  | "Wagon"
  | "MPV"
  | "Pickup"
  | "Luxury";
export type FuelType = "Petrol" | "Diesel" | "Electric" | "Hybrid" | "Plugin_Hybrid" | "CNG";
export type Transmission = "Manual" | "Automatic" | "CVT" | "DCT";
export type VehicleStatus = "Available" | "Reserved" | "In_Drive" | "Maintenance" | "Sold";
export type AvailabilityStatus = "In_Stock" | "Limited_Stock" | "On_Request" | "Coming_Soon";

export interface VehicleColor {
  name: string;
  hex: string;
  imageUrl?: string;
}

export interface VehicleFaq {
  question: string;
  answer: string;
}

export interface EngineOption {
  name: string;
  displacement: string;
  power: string;
  torque: string;
}

export interface VehicleProps {
  id: string;
  make: string;
  model: string;
  trim?: string;
  year: number;
  vin: string;
  bodyType: BodyType;
  fuelType: FuelType;
  transmission: Transmission;
  color?: string;
  price: Money;
  priceMax?: Money;
  odometer: number;
  status: VehicleStatus;
  /** Always the dealership of branchId — callers set both together (see Vehicle.moveToBranch). */
  dealershipId: string;
  branchId: string;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewLaunch: boolean;
  availabilityStatus: AvailabilityStatus;
  seatingCapacity?: number;
  mileageKmpl?: number;
  safetyRatingStars?: number;
  primaryImageUrl?: string;
  galleryUrls: string[];
  videoUrl?: string;
  specSheet: Record<string, string>;
  accessories: string[];
  description?: string;
  engineOptions: EngineOption[];
  safetyFeatures: string[];
  infotainmentFeatures: string[];
  exteriorHighlights: string[];
  interiorHighlights: string[];
  colors: VehicleColor[];
  faqs: VehicleFaq[];
}

export class Vehicle {
  private constructor(private props: VehicleProps) {}

  static restore(props: VehicleProps): Vehicle {
    return new Vehicle(props);
  }

  /** A new vehicle has no identity until the repository persists it and assigns one. */
  static create(props: Omit<VehicleProps, "id">): Vehicle {
    return new Vehicle({ ...props, id: UNASSIGNED_ID });
  }

  get id() {
    return this.props.id;
  }
  get branchId() {
    return this.props.branchId;
  }
  get dealershipId() {
    return this.props.dealershipId;
  }
  get status() {
    return this.props.status;
  }
  get price() {
    return this.props.price;
  }
  get bodyType() {
    return this.props.bodyType;
  }

  get isBookable(): boolean {
    return this.props.status === "Available" || this.props.status === "Reserved";
  }

  markInDrive(): void {
    this.props.status = "In_Drive";
  }

  markAvailable(): void {
    this.props.status = "Available";
  }

  updateDetails(patch: Partial<Omit<VehicleProps, "id" | "branchId" | "dealershipId">>): void {
    this.props = { ...this.props, ...patch };
  }

  /** Branch and dealership only ever change together, so a vehicle can't end up at another dealership's branch. */
  moveToBranch(branchId: string, dealershipId: string): void {
    this.props.branchId = branchId;
    this.props.dealershipId = dealershipId;
  }

  toProps(): VehicleProps {
    return { ...this.props };
  }
}

export interface VehicleVariantProps {
  id: string;
  vehicleId: string;
  name: string;
  price: Money;
  engine?: string;
  fuelType: FuelType;
  transmission: Transmission;
  isDefault: boolean;
  displayOrder: number;
}

export class VehicleVariant {
  private constructor(private props: VehicleVariantProps) {}

  static restore(props: VehicleVariantProps): VehicleVariant {
    return new VehicleVariant(props);
  }

  get id() {
    return this.props.id;
  }
  get vehicleId() {
    return this.props.vehicleId;
  }

  toProps(): VehicleVariantProps {
    return { ...this.props };
  }
}
