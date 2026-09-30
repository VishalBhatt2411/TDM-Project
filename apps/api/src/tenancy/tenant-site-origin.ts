import { env } from "../common/env";
import { isAssignableSubdomainLabel } from "./organization-slug";

/**
 * Public origin of a tenant's customer site on the platform domain — "<label>.<TENANT_BASE_DOMAIN>",
 * with WEB_ORIGIN's scheme and port (https and no port in production). For places that have no
 * request host to resolve a relative URL against, such as emails. Undefined when `label` couldn't
 * route (the host sync skips invalid and reserved labels, so no site exists for it).
 */
export function tenantSiteOrigin(label: string | undefined): string | undefined {
  const normalized = label?.trim().toLowerCase();
  if (!isAssignableSubdomainLabel(normalized)) return undefined;
  const { protocol, port } = new URL(env.webOrigin);
  return `${protocol}//${normalized}.${env.tenantBaseDomain}${port ? `:${port}` : ""}`;
}
