/** A component the data provider rejected, reported verbatim to the admin. */
export interface MetadataDeployFailure {
  fullName: string;
  componentType: string | null;
  problem: string | null;
}

export interface MetadataDeployResult {
  success: boolean;
  status: string;
  componentsDeployed: number;
  componentsTotal: number;
  failures: MetadataDeployFailure[];
}

/**
 * Deploys the TDM metadata package into one tenant's connected org using its stored
 * connection — callers never handle a refresh token or a provider connection
 * themselves. Bound to TENANT_METADATA_DEPLOYER; the adapter behind it is chosen in
 * infrastructure.module.ts.
 */
export type TenantMetadataDeployer = (organizationId: string) => Promise<MetadataDeployResult>;
