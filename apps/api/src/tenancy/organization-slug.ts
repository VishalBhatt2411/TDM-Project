/** A tenant's URL-safe identifier — also its platform subdomain label ("<slug>.<TENANT_BASE_DOMAIN>"). */
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const ORGANIZATION_SLUG_MAX_LENGTH = 63;

/**
 * Platform subdomains that must never route to a tenant — infrastructure hosts, and names a
 * customer could mistake for the platform itself. Applies to company slugs and dealer slugs alike.
 */
export const RESERVED_SUBDOMAIN_LABELS: readonly string[] = [
  "www", "api", "admin", "app", "auth", "login", "mail", "smtp", "static", "assets", "cdn", "status", "docs", "support", "onboarding",
];

export function isValidOrganizationSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= ORGANIZATION_SLUG_MAX_LENGTH && ORGANIZATION_SLUG_PATTERN.test(value);
}

/** A well-formed label that may be registered as a tenant's (company or dealership) subdomain. */
export function isAssignableSubdomainLabel(value: unknown): value is string {
  return isValidOrganizationSlug(value) && !RESERVED_SUBDOMAIN_LABELS.includes(value);
}
