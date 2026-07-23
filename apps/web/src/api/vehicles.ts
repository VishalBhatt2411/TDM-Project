import type {
  EmiEstimateRequest,
  EmiEstimateResponse,
  Paginated,
  VehicleDto,
  VehicleSearchQuery,
  VehicleVariantDto,
} from "@tdm/types";
import { apiClient } from "@/lib/api-client";

export async function searchVehicles(query: VehicleSearchQuery): Promise<Paginated<VehicleDto>> {
  const { data } = await apiClient.get<Paginated<VehicleDto>>("/vehicles", { params: query });
  return data;
}

export async function getVehicle(id: string): Promise<VehicleDto> {
  const { data } = await apiClient.get<VehicleDto>(`/vehicles/${id}`);
  return data;
}

export async function getFeaturedVehicles(kind: "featured" | "bestSeller" | "newLaunch"): Promise<VehicleDto[]> {
  const { data } = await apiClient.get<VehicleDto[]>("/vehicles/featured", { params: { kind } });
  return data;
}

export async function getVehicleVariants(vehicleId: string): Promise<VehicleVariantDto[]> {
  const { data } = await apiClient.get<VehicleVariantDto[]>(`/vehicles/${vehicleId}/variants`);
  return data;
}

export async function getRelatedVehicles(vehicleId: string): Promise<VehicleDto[]> {
  const { data } = await apiClient.get<VehicleDto[]>(`/vehicles/${vehicleId}/related`);
  return data;
}

export async function estimateEmi(request: EmiEstimateRequest): Promise<EmiEstimateResponse> {
  const { data } = await apiClient.post<EmiEstimateResponse>("/vehicles/emi-estimate", request);
  return data;
}
