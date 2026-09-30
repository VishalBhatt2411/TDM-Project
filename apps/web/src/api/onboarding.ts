import { onboardingApiClient } from "@/lib/onboarding-api-client";
import { onboardingTokenFor, rememberOnboardingToken } from "@/lib/onboarding-session";

/** Every step after creation proves it's the same wizard with the setup token issued then. */
function setupHeaders(organizationId: string) {
  const token = onboardingTokenFor(organizationId);
  return token ? { "X-Onboarding-Token": token } : {};
}

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
  const { data } = await onboardingApiClient.post<OrganizationStatusDto & { onboardingToken: string }>("/onboarding/organizations", input);
  const { onboardingToken, ...status } = data;
  rememberOnboardingToken(status.id, onboardingToken);
  return status;
}

/** A wizard step opened without this browser's setup token (another browser, cleared storage) can't continue. */
export function hasOnboardingSession(organizationId: string): boolean {
  return !!onboardingTokenFor(organizationId);
}

export async function saveSalesforceCredentials(
  organizationId: string,
  input: { consumerKey: string; consumerSecret: string; loginUrl?: string },
): Promise<OrganizationStatusDto> {
  const { data } = await onboardingApiClient.post<OrganizationStatusDto>(
    `/onboarding/${organizationId}/salesforce-credentials`,
    input,
    { headers: setupHeaders(organizationId) },
  );
  return data;
}

/** Salesforce's hosted authorization page for this organization's Connected App — the browser navigates there. */
export async function getSalesforceAuthorizeUrl(organizationId: string): Promise<string> {
  const { data } = await onboardingApiClient.post<{ authorizationUrl: string }>(
    `/onboarding/${organizationId}/salesforce/authorize`,
    undefined,
    { headers: setupHeaders(organizationId) },
  );
  return data.authorizationUrl;
}

export async function getOrganizationStatus(organizationId: string): Promise<OrganizationStatusDto> {
  const { data } = await onboardingApiClient.get<OrganizationStatusDto>(`/onboarding/${organizationId}/status`, {
    headers: setupHeaders(organizationId),
  });
  return data;
}

export interface CompleteOnboardingResult {
  staffUserId: string;
  email: string;
  name: string;
}

export async function completeOnboarding(organizationId: string): Promise<CompleteOnboardingResult> {
  const { data } = await onboardingApiClient.post<CompleteOnboardingResult>(`/onboarding/${organizationId}/complete`, undefined, {
    headers: setupHeaders(organizationId),
  });
  return data;
}
