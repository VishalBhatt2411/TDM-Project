import { onboardingApiClient } from "@/lib/onboarding-api-client";

export type OrganizationConnectionStatus = "pending" | "connected" | "error";

export interface OrganizationStatusDto {
  id: string;
  name: string;
  slug: string;
  connectionStatus: OrganizationConnectionStatus;
  connectionError: string | null;
  metadataDeployedAt: string | null;
  salesforceCallbackUrl: string;
}

export async function createOrganization(input: { name: string; slug: string }): Promise<OrganizationStatusDto> {
  const { data } = await onboardingApiClient.post<OrganizationStatusDto>("/onboarding/organizations", input);
  return data;
}

export async function saveSalesforceCredentials(
  organizationId: string,
  input: { consumerKey: string; consumerSecret: string; loginUrl?: string },
): Promise<OrganizationStatusDto> {
  const { data } = await onboardingApiClient.post<OrganizationStatusDto>(
    `/onboarding/${organizationId}/salesforce-credentials`,
    input,
  );
  return data;
}

export function salesforceAuthorizeUrl(organizationId: string): string {
  return `/api/v1/onboarding/${organizationId}/salesforce/authorize`;
}

export async function getOrganizationStatus(organizationId: string): Promise<OrganizationStatusDto> {
  const { data } = await onboardingApiClient.get<OrganizationStatusDto>(`/onboarding/${organizationId}/status`);
  return data;
}

export interface CompleteOnboardingResult {
  staffUserId: string;
  email: string;
  name: string;
}

export async function completeOnboarding(organizationId: string): Promise<CompleteOnboardingResult> {
  const { data } = await onboardingApiClient.post<CompleteOnboardingResult>(`/onboarding/${organizationId}/complete`);
  return data;
}
