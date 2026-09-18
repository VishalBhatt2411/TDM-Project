import path from "node:path";
import archiver from "archiver";
import type { Connection } from "jsforce";

const MDAPI_DIR = path.join(__dirname, "..", "mdapi");

export interface MetadataDeployComponentResult {
  fullName: string;
  componentType: string | null;
  problem: string | null;
}

export interface MetadataDeployResult {
  success: boolean;
  status: string;
  componentsDeployed: number;
  componentsTotal: number;
  failures: MetadataDeployComponentResult[];
}

/**
 * Deploys the TDM package (integrations/salesforce/mdapi — objects, permission sets,
 * Apex, LWC dashboard) into a freshly-connected tenant org, as the final step of the
 * onboarding wizard (see OnboardingService). The tenant's own hand-created Connected
 * App is never part of this package (mdapi/package.xml has no ConnectedApp member) —
 * deploying one here would conflict with what they already created in the wizard's
 * guided step.
 *
 * A failure here is not necessarily a TDM metadata problem: production orgs require
 * >=75% Apex code coverage org-wide to accept any deploy, a precondition entirely
 * outside this package's control. Callers should surface `failures` verbatim rather
 * than collapsing this into a generic "deploy failed" message.
 */
export async function deployTdmMetadata(connection: Connection): Promise<MetadataDeployResult> {
  const zipBuffer = await zipMetadataDirectory();
  const deployResult = await connection.metadata.deploy(zipBuffer, { singlePackage: true, rollbackOnError: true }).complete(true);

  const failures = (deployResult.details?.componentFailures ?? []).map((failure) => ({
    fullName: failure.fullName,
    componentType: failure.componentType ?? null,
    problem: failure.problem ?? null,
  }));

  return {
    success: deployResult.success,
    status: deployResult.status,
    componentsDeployed: deployResult.numberComponentsDeployed,
    componentsTotal: deployResult.numberComponentsTotal,
    failures,
  };
}

function zipMetadataDirectory(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));

    archive.directory(MDAPI_DIR, false);
    archive.finalize();
  });
}
