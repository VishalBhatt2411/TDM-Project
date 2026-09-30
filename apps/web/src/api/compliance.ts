import type { ComplianceStatusDto, SubmitComplianceRequest } from "@tdm/types";
import { apiClient } from "@/lib/api-client";

export async function getComplianceStatus(bookingId: string): Promise<ComplianceStatusDto> {
  const { data } = await apiClient.get<ComplianceStatusDto>(`/bookings/${bookingId}/compliance`);
  return data;
}

export async function submitCompliance(bookingId: string, request: SubmitComplianceRequest): Promise<ComplianceStatusDto> {
  const { data } = await apiClient.post<ComplianceStatusDto>(`/bookings/${bookingId}/compliance`, request);
  return data;
}
