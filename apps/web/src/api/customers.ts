import type { CustomerDashboardDto, CustomerDto, VehicleDto, VehicleRecommendationDto } from "@tdm/types";
import { apiClient } from "@/lib/api-client";

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  preferredLanguage?: "en" | "hi" | "es" | "fr";
  marketingOptIn?: boolean;
}

export async function updateProfile(input: UpdateProfileRequest): Promise<CustomerDto> {
  const { data } = await apiClient.patch<CustomerDto>("/auth/me", input);
  return data;
}

export async function getDashboard(): Promise<CustomerDashboardDto> {
  const { data } = await apiClient.get<CustomerDashboardDto>("/customers/me/dashboard");
  return data;
}

export async function listWishlist(): Promise<VehicleDto[]> {
  const { data } = await apiClient.get<VehicleDto[]>("/customers/me/wishlist");
  return data;
}

export async function addToWishlist(vehicleId: string): Promise<{ added: true }> {
  const { data } = await apiClient.post<{ added: true }>("/customers/me/wishlist", { vehicleId });
  return data;
}

export async function removeFromWishlist(vehicleId: string): Promise<{ removed: true }> {
  const { data } = await apiClient.delete<{ removed: true }>(`/customers/me/wishlist/${vehicleId}`);
  return data;
}

export async function getRecommendations(limit = 6): Promise<VehicleRecommendationDto[]> {
  const { data } = await apiClient.get<VehicleRecommendationDto[]>("/customers/me/recommendations", { params: { limit } });
  return data;
}
