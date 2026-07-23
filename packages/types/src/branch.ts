import type { Address, GeoCoordinates } from "./common";

export interface BranchDto {
  id: string;
  name: string;
  address: Address;
  geo?: GeoCoordinates;
  phone?: string;
  email?: string;
  operatingHours?: string;
  managerName?: string;
  isActive: boolean;
}

export interface SalesRepDto {
  id: string;
  name: string;
  email: string;
  phone?: string;
  branchId: string;
  isActive: boolean;
  maxDailyBookings?: number;
}
