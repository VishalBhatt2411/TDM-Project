import type { MetadataDeployResult } from "@tdm/salesforce-adapter";

/**
 * Deploys the TDM metadata package into one tenant's connected org using its stored
 * connection — callers never handle a refresh token or a provider connection
 * themselves. Bound to TENANT_METADATA_DEPLOYER.
 */
export type TenantMetadataDeployer = (organizationId: string) => Promise<MetadataDeployResult>;
