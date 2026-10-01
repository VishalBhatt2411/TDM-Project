import axios from "axios";
import type { OrganizationConnectionStatus } from "@/api/onboarding";

// The operator console's session is its own HttpOnly cookie (path /api/v1/platform) — it shares
// nothing with the customer or staff clients.
const platformApiClient = axios.create({ baseURL: "/api/v1/platform", withCredentials: true });

export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  connectionStatus: OrganizationConnectionStatus;
  connectionError: string | null;
  sfOrgId: string | null;
  sfInstanceUrl: string | null;
  metadataDeployedAt: string | null;
  createdAt: string;
}

export async function platformLogin(password: string): Promise<void> {
  await platformApiClient.post("/session", { password });
}

export async function platformLogout(): Promise<void> {
  await platformApiClient.delete("/session");
}

/** True while a valid operator session exists; false on 401. Other failures (e.g. 404 = console disabled) throw. */
export async function hasPlatformSession(): Promise<boolean> {
  try {
    await platformApiClient.get("/session");
    return true;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) return false;
    throw error;
  }
}

export async function listPlatformOrganizations(): Promise<PlatformOrganization[]> {
  const { data } = await platformApiClient.get<PlatformOrganization[]>("/organizations");
  return data;
}

export async function reconnectPlatformOrganization(organizationId: string): Promise<{ setupUrl: string }> {
  const { data } = await platformApiClient.post<{ setupUrl: string }>(`/organizations/${organizationId}/reconnect`);
  return data;
}

export async function deletePlatformOrganization(organizationId: string, confirmSlug: string): Promise<void> {
  await platformApiClient.delete(`/organizations/${organizationId}`, { data: { confirmSlug } });
}
