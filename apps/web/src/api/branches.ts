import type { Address, GeoCoordinates } from "@tdm/types";
import { apiClient } from "@/lib/api-client";

export interface BranchDto {
  id: string;
  dealershipId: string;
  name: string;
  address: Address;
  geo?: GeoCoordinates;
  phone?: string;
  operatingHours?: string;
  managerName?: string;
}

export async function listBranches(): Promise<BranchDto[]> {
  const { data } = await apiClient.get<BranchDto[]>("/branches");
  return data;
}
