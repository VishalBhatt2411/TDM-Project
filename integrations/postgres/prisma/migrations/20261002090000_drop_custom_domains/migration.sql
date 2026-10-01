-- One customer site per company (<slug>.<TENANT_BASE_DOMAIN>): dealer subdomains and custom
-- domains are gone, and a host resolves straight from Organization.slug.
DROP TABLE "TenantHost";
DROP TABLE "CompanyDomainClaim";
DROP TABLE "TenantSubdomain";
