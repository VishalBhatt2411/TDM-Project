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

/** A desired host another tenant (or another dealership) already holds — never overwritten, only reported. */
export interface DealershipHostConflict {
  dealershipId: string;
  host: string;
  kind: "label" | "custom_domain";
}

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
   * rows that are no longer desired, then claims each desired label/domain that is free. A host
   * already held by another tenant — or by another of this tenant's dealerships, or by the
   * company label — is never taken over; it is returned as a conflict. Company-level rows
   * (dealershipId null) are left untouched.
   */
  async syncDealershipHosts(organizationId: string, entries: DealershipHostEntry[]): Promise<DealershipHostConflict[]> {
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
    for (const [hostname, dealershipId] of wantedDomains) {
      const claimed = await this.claim(organizationId, dealershipId, () =>
        this.prisma.tenantHost.findUnique({ where: { hostname } }),
        () => this.prisma.tenantHost.create({ data: { hostname, organizationId, dealershipId } }),
      );
      if (!claimed) conflicts.push({ dealershipId, host: hostname, kind: "custom_domain" });
    }
    return conflicts;
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
  async create(input: { name: string; slug: string }): Promise<OrganizationRecord> {
    const slug = input.slug.toLowerCase();
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        if (await tx.tenantSubdomain.findUnique({ where: { label: slug } })) throw new OrganizationSlugTakenError(slug);
        return tx.organization.create({
          data: { name: input.name, slug, subdomains: { create: { label: slug } } },
        });
      });
      return toRecord(record);
    } catch (err) {
      if (isUniqueViolation(err)) throw new OrganizationSlugTakenError(slug);
      throw err;
    }
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
