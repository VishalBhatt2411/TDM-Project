import { Organization, Prisma, PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "../crypto";

export type OrganizationConnectionStatus = "pending" | "connected" | "error";

/** Tenant metadata safe to hand to any caller — secrets never leave this repository in ciphertext or plaintext form. */
export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  sfConsumerKey: string | null;
  hasConsumerSecret: boolean;
  hasRefreshToken: boolean;
  sfInstanceUrl: string | null;
  sfLoginUrl: string;
  sfOrgId: string | null;
  connectionStatus: OrganizationConnectionStatus;
  connectionError: string | null;
  metadataDeployedAt: Date | null;
  encryptionKeyVersion: number;
  createdAt: Date;
}

/** Where a request's hostname routes: a tenant, and optionally one of its dealerships (null = company-wide). */
export interface HostRoute {
  organizationId: string;
  dealershipId: string | null;
}

/** A dealership's desired platform label and/or custom domain, as configured in the tenant's data provider. */
export interface DealershipHostEntry {
  dealershipId: string;
  label: string;
  customDomain?: string;
}

/** A desired host another of this tenant's dealerships (or another tenant's label) already holds — never overwritten, only reported. */
export interface DealershipHostConflict {
  dealershipId: string;
  host: string;
  kind: "label" | "custom_domain";
}

/** A dealer custom domain the tenant wants but doesn't hold yet — it goes live once DNS proves ownership (see claimVerifiedHost). */
export interface UnverifiedDealershipDomain {
  dealershipId: string;
  hostname: string;
}

export interface DealershipHostSyncResult {
  conflicts: DealershipHostConflict[];
  unverifiedDomains: UnverifiedDealershipDomain[];
}

/** A custom domain routed to a tenant: company-wide (dealershipId null) or a dealer's. */
export interface TenantCustomDomain {
  hostname: string;
  dealershipId: string | null;
}

/** "transferred": the domain was held by another tenant, and DNS now proves this one controls it. */
export type HostClaimOutcome = "claimed" | "transferred" | "conflict";

/** Thrown by create() when the company slug is already a registered subdomain label (company or dealer). */
export class OrganizationSlugTakenError extends Error {
  constructor(slug: string) {
    super(`The identifier "${slug}" is already taken.`);
    this.name = "OrganizationSlugTakenError";
  }
}

/** Decrypted Connected App material — only for adapter code that performs the OAuth exchange itself. */
export interface ConnectedAppCredentials {
  clientId: string;
  clientSecret: string;
  loginUrl: string;
}

export interface ConnectionCredentials extends ConnectedAppCredentials {
  refreshToken: string;
}

/**
 * Owns encryption of every per-tenant Salesforce secret (AES-256-GCM, see crypto.ts):
 * callers pass and receive plaintext only through the narrow load* methods, so no
 * service or controller ever handles ciphertext or the master key.
 */
export class OrganizationRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly masterKeyHex: string,
  ) {}

  async findById(id: string): Promise<OrganizationRecord | null> {
    const record = await this.prisma.organization.findUnique({ where: { id } });
    return record ? toRecord(record) : null;
  }

  async findBySlug(slug: string): Promise<OrganizationRecord | null> {
    const record = await this.prisma.organization.findUnique({ where: { slug: slug.toLowerCase() } });
    return record ? toRecord(record) : null;
  }

  /** A platform subdomain label ("<label>.<base domain>") — a company slug or a dealer's Url_Slug__c. */
  async resolveSubdomainLabel(label: string): Promise<HostRoute | null> {
    const row = await this.prisma.tenantSubdomain.findUnique({ where: { label: label.toLowerCase() } });
    return row ? { organizationId: row.organizationId, dealershipId: row.dealershipId } : null;
  }

  /** A company's or dealer's own custom domain (hostname lowercase, no port). */
  async resolveCustomDomain(hostname: string): Promise<HostRoute | null> {
    const row = await this.prisma.tenantHost.findUnique({ where: { hostname: hostname.toLowerCase() } });
    return row ? { organizationId: row.organizationId, dealershipId: row.dealershipId } : null;
  }

  /**
   * Reconciles one tenant's dealer hosts with its data provider: removes that tenant's dealer
   * rows that are no longer desired, then claims each desired label that is free. A label
   * already held elsewhere is never taken over; it is returned as a conflict. A desired custom
   * domain is never claimed here — anyone can type any domain into a data provider — it is
   * returned as unverified until DNS proves ownership (claimVerifiedHost). Company-level rows
   * (dealershipId null) are left untouched.
   */
  async syncDealershipHosts(organizationId: string, entries: DealershipHostEntry[]): Promise<DealershipHostSyncResult> {
    const wantedLabels = new Map(entries.map((e) => [e.label.toLowerCase(), e.dealershipId]));
    const wantedDomains = new Map(
      entries.filter((e) => e.customDomain).map((e) => [e.customDomain!.toLowerCase(), e.dealershipId]),
    );

    const [labels, domains] = await Promise.all([
      this.prisma.tenantSubdomain.findMany({ where: { organizationId, dealershipId: { not: null } } }),
      this.prisma.tenantHost.findMany({ where: { organizationId, dealershipId: { not: null } } }),
    ]);
    const staleLabels = labels.filter((r) => wantedLabels.get(r.label) !== r.dealershipId).map((r) => r.label);
    const staleDomains = domains.filter((r) => wantedDomains.get(r.hostname) !== r.dealershipId).map((r) => r.hostname);
    if (staleLabels.length) {
      await this.prisma.tenantSubdomain.deleteMany({ where: { organizationId, label: { in: staleLabels } } });
    }
    if (staleDomains.length) {
      await this.prisma.tenantHost.deleteMany({ where: { organizationId, hostname: { in: staleDomains } } });
    }

    const conflicts: DealershipHostConflict[] = [];
    for (const [label, dealershipId] of wantedLabels) {
      const claimed = await this.claim(organizationId, dealershipId, () =>
        this.prisma.tenantSubdomain.findUnique({ where: { label } }),
        () => this.prisma.tenantSubdomain.create({ data: { label, organizationId, dealershipId } }),
      );
      if (!claimed) conflicts.push({ dealershipId, host: label, kind: "label" });
    }
    const unverifiedDomains: UnverifiedDealershipDomain[] = [];
    for (const [hostname, dealershipId] of wantedDomains) {
      const existing = await this.prisma.tenantHost.findUnique({ where: { hostname } });
      if (existing?.organizationId === organizationId) {
        if (existing.dealershipId !== dealershipId) conflicts.push({ dealershipId, host: hostname, kind: "custom_domain" });
        continue;
      }
      unverifiedDomains.push({ dealershipId, hostname });
    }
    return { conflicts, unverifiedDomains };
  }

  /**
   * Routes a custom domain whose DNS ownership was just proven to this tenant (dealershipId
   * null = company-wide). The proof outranks an earlier holder in another tenant — whoever
   * controls the domain's DNS decides where it points — but never moves a domain between two
   * sites of the same tenant. A company-wide claim is consumed once it is live.
   */
  async claimVerifiedHost(organizationId: string, dealershipId: string | null, hostname: string): Promise<HostClaimOutcome> {
    const host = hostname.toLowerCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.tenantHost.findUnique({ where: { hostname: host } });
        let outcome: HostClaimOutcome = "claimed";
        if (existing?.organizationId === organizationId) {
          if (existing.dealershipId !== dealershipId) return "conflict";
        } else {
          if (existing) {
            await tx.tenantHost.delete({ where: { hostname: host } });
            outcome = "transferred";
          }
          await tx.tenantHost.create({ data: { hostname: host, organizationId, dealershipId } });
        }
        if (dealershipId === null) {
          await tx.companyDomainClaim.deleteMany({ where: { organizationId, hostname: host } });
        }
        return outcome;
      });
    } catch (err) {
      if (isUniqueViolation(err)) return "conflict";
      throw err;
    }
  }

  /** Every custom domain routed to this tenant. */
  async listCustomDomains(organizationId: string): Promise<TenantCustomDomain[]> {
    const rows = await this.prisma.tenantHost.findMany({
      where: { organizationId },
      select: { hostname: true, dealershipId: true },
      orderBy: { hostname: "asc" },
    });
    return rows;
  }

  /** Company-wide custom domains this tenant asked for that aren't verified yet. */
  async listCompanyDomainClaims(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.companyDomainClaim.findMany({
      where: { organizationId },
      select: { hostname: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.hostname);
  }

  /** Idempotent — asking twice for the same domain keeps one claim. */
  async addCompanyDomainClaim(organizationId: string, hostname: string): Promise<void> {
    const host = hostname.toLowerCase();
    await this.prisma.companyDomainClaim.upsert({
      where: { organizationId_hostname: { organizationId, hostname: host } },
      create: { organizationId, hostname: host },
      update: {},
    });
  }

  /** Drops a company-wide custom domain, pending or live. False when this tenant had no such domain. */
  async removeCompanyDomain(organizationId: string, hostname: string): Promise<boolean> {
    const host = hostname.toLowerCase();
    const [claims, hosts] = await this.prisma.$transaction([
      this.prisma.companyDomainClaim.deleteMany({ where: { organizationId, hostname: host } }),
      this.prisma.tenantHost.deleteMany({ where: { organizationId, hostname: host, dealershipId: null } }),
    ]);
    return claims.count + hosts.count > 0;
  }

  /** True if the host is (now) held by exactly this tenant + dealership; a concurrent claim (P2002) counts as a loss. */
  private async claim(
    organizationId: string,
    dealershipId: string,
    find: () => Promise<{ organizationId: string; dealershipId: string | null } | null>,
    create: () => Promise<unknown>,
  ): Promise<boolean> {
    const existing = await find();
    if (existing) return existing.organizationId === organizationId && existing.dealershipId === dealershipId;
    try {
      await create();
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) return false;
      throw err;
    }
  }

  /** Tenants that background jobs (reminders, follow-ups) must iterate over. */
  async listConnectedIds(): Promise<string[]> {
    const records = await this.prisma.organization.findMany({
      where: { connectionStatus: "connected", sfRefreshTokenEnc: { not: null } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    return records.map((r) => r.id);
  }

  /** Creates the company together with its subdomain label, atomically — the label namespace is shared with dealer slugs. */
  async create(input: { name: string; slug: string; onboardingTokenHash: string }): Promise<OrganizationRecord> {
    const slug = input.slug.toLowerCase();
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        if (await tx.tenantSubdomain.findUnique({ where: { label: slug } })) throw new OrganizationSlugTakenError(slug);
        return tx.organization.create({
          data: { name: input.name, slug, onboardingTokenHash: input.onboardingTokenHash, subdomains: { create: { label: slug } } },
        });
      });
      return toRecord(record);
    } catch (err) {
      if (isUniqueViolation(err)) throw new OrganizationSlugTakenError(slug);
      throw err;
    }
  }

  /** Whether `tokenHash` is the onboarding setup token issued for this organization. */
  async matchesOnboardingToken(id: string, tokenHash: string): Promise<boolean> {
    const record = await this.prisma.organization.findFirst({ where: { id, onboardingTokenHash: tokenHash }, select: { id: true } });
    return record !== null;
  }

  /**
   * Consumer Key/Secret pasted in the onboarding wizard — the secret is encrypted before it is
   * written. A different Consumer Key is a different Connected App, and a refresh token is only
   * valid for the app that issued it, so switching apps drops the stored token and returns the
   * tenant to "pending" until it re-authorizes. The bound sfOrgId is kept (see handleCallback).
   */
  async saveSalesforceCredentials(id: string, input: { consumerKey: string; consumerSecret: string; loginUrl?: string }): Promise<void> {
    const current = await this.prisma.organization.findUnique({ where: { id }, select: { sfConsumerKey: true } });
    const appChanged = current?.sfConsumerKey !== input.consumerKey;
    await this.prisma.organization.update({
      where: { id },
      data: {
        sfConsumerKey: input.consumerKey,
        sfConsumerSecretEnc: encryptSecret(input.consumerSecret, this.masterKeyHex),
        ...(input.loginUrl ? { sfLoginUrl: input.loginUrl } : {}),
        ...(appChanged ? { sfRefreshTokenEnc: null, connectionStatus: "pending", connectionError: null } : {}),
      },
    });
  }

  /** Result of a successful OAuth connection handshake. */
  async saveConnectionResult(id: string, input: { refreshToken: string; instanceUrl: string; sfOrgId: string }): Promise<void> {
    await this.prisma.organization.update({
      where: { id },
      data: {
        sfRefreshTokenEnc: encryptSecret(input.refreshToken, this.masterKeyHex),
        sfInstanceUrl: input.instanceUrl,
        sfOrgId: input.sfOrgId,
        connectionStatus: "connected",
        connectionError: null,
      },
    });
  }

  /** Salesforce issued a new refresh token during a refresh (rotation policy) — the old one is now dead. */
  async saveRotatedRefreshToken(id: string, refreshToken: string): Promise<void> {
    await this.prisma.organization.update({
      where: { id },
      data: { sfRefreshTokenEnc: encryptSecret(refreshToken, this.masterKeyHex) },
    });
  }

  /** Null until the onboarding wizard has stored both halves of the Connected App credentials. */
  async loadConnectedAppCredentials(id: string): Promise<ConnectedAppCredentials | null> {
    const record = await this.prisma.organization.findUnique({ where: { id } });
    if (!record?.sfConsumerKey || !record.sfConsumerSecretEnc) return null;
    return {
      clientId: record.sfConsumerKey,
      clientSecret: decryptSecret(record.sfConsumerSecretEnc, this.masterKeyHex),
      loginUrl: record.sfLoginUrl,
    };
  }

  /** Null unless the tenant is currently connected — a tenant in "error" must reconnect, not keep retrying a rejected token. */
  async loadConnectionCredentials(id: string): Promise<ConnectionCredentials | null> {
    const record = await this.prisma.organization.findUnique({ where: { id } });
    if (
      !record ||
      record.connectionStatus !== "connected" ||
      !record.sfConsumerKey ||
      !record.sfConsumerSecretEnc ||
      !record.sfRefreshTokenEnc
    ) {
      return null;
    }
    return {
      clientId: record.sfConsumerKey,
      clientSecret: decryptSecret(record.sfConsumerSecretEnc, this.masterKeyHex),
      loginUrl: record.sfLoginUrl,
      refreshToken: decryptSecret(record.sfRefreshTokenEnc, this.masterKeyHex),
    };
  }

  /** The OAuth handshake failed, or Salesforce later rejected the stored refresh token — the org is not connected. */
  async recordConnectionError(id: string, message: string): Promise<void> {
    await this.prisma.organization.update({
      where: { id },
      data: { connectionStatus: "error", connectionError: message },
    });
  }

  /** The org connected fine, but the post-connect metadata deploy failed — connectionStatus stays "connected". */
  async recordMetadataDeployError(id: string, message: string): Promise<void> {
    await this.prisma.organization.update({ where: { id }, data: { connectionError: message } });
  }

  async markMetadataDeployed(id: string): Promise<void> {
    await this.prisma.organization.update({
      where: { id },
      data: { metadataDeployedAt: new Date(), connectionError: null },
    });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function toRecord(record: Organization): OrganizationRecord {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    sfConsumerKey: record.sfConsumerKey,
    hasConsumerSecret: record.sfConsumerSecretEnc !== null,
    hasRefreshToken: record.sfRefreshTokenEnc !== null,
    sfInstanceUrl: record.sfInstanceUrl,
    sfLoginUrl: record.sfLoginUrl,
    sfOrgId: record.sfOrgId,
    connectionStatus: record.connectionStatus as OrganizationConnectionStatus,
    connectionError: record.connectionError,
    metadataDeployedAt: record.metadataDeployedAt,
    encryptionKeyVersion: record.encryptionKeyVersion,
    createdAt: record.createdAt,
  };
}
