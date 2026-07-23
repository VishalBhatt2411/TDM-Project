import { apiClient } from "@/lib/api-client";

export interface DealershipConfigDto {
  name: string;
  tagline?: string;
  logoText?: string;
  phone?: string;
  email?: string;
  address?: string;
  operatingHours?: string;
  primaryColorHex?: string;
}

export async function getDealershipConfig(): Promise<DealershipConfigDto> {
  const { data } = await apiClient.get<DealershipConfigDto>("/config/dealership");
  return data;
}
