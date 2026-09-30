/**
 * Emergency recovery only. A tenant's first Company Admin is normally whoever connects the org
 * through the onboarding wizard (OnboardingService.grantFirstCompanyAdmin). Use this script when
 * a tenant has lost every active Company Admin (e.g. the only one was deactivated) or onboarding
 * could not grant one.
 *
 * Grants — or reactivates — a Company_Admin Staff_Assignment__c for an active Salesforce User.
 * StaffAssignmentTrigger then syncs the TDM_Full_Access permission set, and the user can sign in
 * with "Login with Salesforce". Run it as an org admin (Modify All Data satisfies the trigger's
 * Company Admin guard); the org must already have the TDM package deployed.
 *
 * Usage: node grant-company-admin.mjs <sf-target-org> <username | email | 005 User Id>
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import jsforce from "jsforce";

const execFileAsync = promisify(execFile);
const COMPANY_ADMIN = "Company_Admin";

async function getConnection(targetOrg) {
  // `shell: true` (needed for sf.cmd on Windows) concatenates args unescaped — allow only alias/username characters.
  if (!/^[\w.@+-]+$/.test(targetOrg)) throw new Error(`Invalid target org "${targetOrg}".`);
  const { stdout } = await execFileAsync(
    "sf",
    ["org", "display", "--target-org", targetOrg, "--json"],
    { env: { ...process.env, SF_TEMP_SHOW_SECRETS: "true" }, shell: process.platform === "win32" },
  );
  const { result } = JSON.parse(stdout);
  if (!result?.accessToken) throw new Error(`sf CLI has no session for "${targetOrg}" — run: sf org login web --alias ${targetOrg}`);
  return new jsforce.Connection({ accessToken: result.accessToken, instanceUrl: result.instanceUrl });
}

const soqlString = (value) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

async function findUser(conn, identifier) {
  const condition = /^005[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/.test(identifier)
    ? `Id = ${soqlString(identifier)}`
    : `(Username = ${soqlString(identifier)} OR Email = ${soqlString(identifier)})`;
  const { records } = await conn.query(
    `SELECT Id, Name, Username FROM User WHERE ${condition} AND IsActive = true AND UserType = 'Standard' LIMIT 10`,
  );
  if (!records.length) throw new Error(`No active standard Salesforce User matches "${identifier}".`);
  // Emails aren't unique in an org — make the operator pick the exact user.
  if (records.length > 1) {
    throw new Error(`"${identifier}" matches ${records.length} users; pass one Username:\n  ${records.map((u) => u.Username).join("\n  ")}`);
  }
  return records[0];
}

function assertSaved(label, result) {
  if (!result.success) throw new Error(`${label} failed: ${JSON.stringify(result.errors)}`);
}

async function main() {
  const [, , targetOrg, identifier] = process.argv;
  if (!targetOrg || !identifier) {
    console.error("Usage: node grant-company-admin.mjs <sf-target-org> <username | email | 005 User Id>");
    process.exit(1);
  }

  const conn = await getConnection(targetOrg);
  const user = await findUser(conn, identifier);
  const { records } = await conn.query(
    `SELECT Id, Is_Active__c FROM Staff_Assignment__c WHERE User__c = ${soqlString(user.Id)} ` +
      `AND Role__c = '${COMPANY_ADMIN}' ORDER BY CreatedDate LIMIT 1`,
  );
  const existing = records[0];

  if (existing?.Is_Active__c) {
    console.log(`${user.Name} (${user.Username}) is already a Company Admin (assignment ${existing.Id}).`);
    return;
  }
  if (existing) {
    assertSaved("Reactivating Staff_Assignment__c", await conn.sobject("Staff_Assignment__c").update({ Id: existing.Id, Is_Active__c: true }));
    console.log(`Reactivated Company Admin access for ${user.Name} (${user.Username}), assignment ${existing.Id}.`);
    return;
  }
  const created = await conn.sobject("Staff_Assignment__c").create({ User__c: user.Id, Role__c: COMPANY_ADMIN, Is_Active__c: true });
  assertSaved("Creating Staff_Assignment__c", created);
  console.log(`Granted Company Admin access to ${user.Name} (${user.Username}), assignment ${created.id}.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
