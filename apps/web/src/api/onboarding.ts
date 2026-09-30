import { onboardingApiClient } from "@/lib/onboarding-api-client";

export type OrganizationConnectionStatus = "pending" | "connected" | "error";

export interface OrganizationStatusDto {
  id: string;
  name: string;
  slug: string;
  connectionStatus: OrganizationConnectionStatus;
  connectionError: string | null;
  metadataDeployedAt: string | null;
  /** Register all of these on the Connected App (one per line in Salesforce's Callback URL box). */
  salesforceCallbackUrls: string[];
}

export interface OnboardingSetupStatus {
  needsSetup: boolean;
}

/** Backs the Admin Console pre-login "connect your Salesforce org" banner for one company (by slug, else the current address). */
export async function getOnboardingSetupStatus(organizationSlug?: string): Promise<OnboardingSetupStatus> {
  const { data } = await onboardingApiClient.get<OnboardingSetupStatus>("/onboarding/status", {
    params: organizationSlug ? { org: organizationSlug } : undefined,
  });
  return data;
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
