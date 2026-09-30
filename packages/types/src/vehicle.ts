import type { Money } from "./common";

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

export interface VehicleDto {
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

export interface VehicleVariantDto {
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

export interface VehicleSearchQuery {
  q?: string;
  bodyType?: BodyType;
  fuelType?: FuelType;
  transmission?: Transmission;
  minPrice?: number;
  maxPrice?: number;
  /** Matches the city of the vehicle's branch. */
  city?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
}

export interface EmiEstimateRequest {
  price: number;
  downPayment: number;
  tenureMonths: number;
  annualInterestRate: number;
}

export interface EmiEstimateResponse {
  monthlyPayment: number;
  totalInterest: number;
  totalPayment: number;
}

export interface VehicleAvailabilityQuery {
  branchId: string;
  date: string; // YYYY-MM-DD
}

export interface VehicleAvailabilityResponse {
  vehicleId: string;
  date: string;
  /**
   * The day's scheduled slots still far enough ahead to book, in order — `time` is its wall-clock
   * start in `timeZone`; a booked one is `available: false`. Empty on a closed day, or once every slot is too soon.
   */
  slots: { time: string; start: string; end: string; available: boolean }[];
  /** Whether the dealership takes test drives at all on `date` (tells "closed" apart from "no times left"). */
  isOpen: boolean;
  /** First date (on the dealership's clock) with a slot still bookable; absent if the schedule is never open. */
  earliestDate?: string;
  /** IANA zone of the vehicle's dealership — `date` and slot wall-clock times are in it. */
  timeZone: string;
  /** Calling code a national phone number is prefixed with when booking; absent means enter "+<code>...". */
  phoneCountryCode?: string;
}
