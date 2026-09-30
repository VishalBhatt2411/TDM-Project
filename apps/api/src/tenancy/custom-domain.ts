import { createHmac } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { env } from "../common/env";

/** Same shape the Dealership__c.Custom_Domain_Format validation rule enforces: a bare lowercase host name. */
const HOSTNAME_PATTERN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAX_HOSTNAME_LENGTH = 253;
const CHALLENGE_LABEL = "_tdm-challenge";
const DNS_TIMEOUT_MS = 5_000;

/** Where the platform's own apps are served — never claimable as a tenant's domain. */
function platformHosts(): Set<string> {
  return new Set([env.webOrigin, env.adminWebOrigin].map((origin) => new URL(origin).hostname.toLowerCase()));
}

/**
 * A host name a tenant may route to its site: well formed, and not the platform's own domain
 * or one of its subdomains (those are assigned through slugs, never claimed).
 */
export function isClaimableCustomDomain(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_HOSTNAME_LENGTH || !HOSTNAME_PATTERN.test(value)) return false;
  const base = env.tenantBaseDomain;
  return value !== base && !value.endsWith(`.${base}`) && !platformHosts().has(value);
}

export interface DomainVerificationRecord {
  /** TXT record name, e.g. "_tdm-challenge.drive.acme.com". */
  name: string;
  value: string;
}

/**
 * The TXT record that proves a tenant controls a domain. It is derived (HMAC) from the tenant
 * and the host name, so it can't be guessed for another tenant and needs no storage; rotating
 * JWT_SECRET only changes the record for domains not yet verified.
 */
export function verificationRecordFor(organizationId: string, hostname: string): DomainVerificationRecord {
  const digest = createHmac("sha256", env.jwtSecret).update(`custom-domain:${organizationId}:${hostname}`).digest("hex");
  return { name: `${CHALLENGE_LABEL}.${hostname}`, value: `tdm-verification=${digest.slice(0, 40)}` };
}

/** Whether the domain's DNS currently publishes this tenant's verification record. Lookup failures count as not verified. */
export async function hasVerificationRecord(organizationId: string, hostname: string): Promise<boolean> {
  const record = verificationRecordFor(organizationId, hostname);
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
  try {
    const answers = await resolver.resolveTxt(record.name);
    return answers.some((chunks) => chunks.join("").trim() === record.value);
  } catch {
    return false;
  }
}
