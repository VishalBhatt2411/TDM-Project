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

/** Thrown by create() when another company already has the slug. */
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

  /** Tenants that background jobs (reminders, follow-ups) must iterate over. */
  async listConnectedIds(): Promise<string[]> {
    const records = await this.prisma.organization.findMany({
      where: { connectionStatus: "connected", sfRefreshTokenEnc: { not: null } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    return records.map((r) => r.id);
  }

  /** Every tenant, newest first — for the platform operator console. */
  async listAll(): Promise<OrganizationRecord[]> {
    const records = await this.prisma.organization.findMany({ orderBy: { createdAt: "desc" } });
    return records.map(toRecord);
  }

  /**
   * Drops the tenant's Salesforce connection and issues a new setup token, so its onboarding
   * wizard can run again. The Connected App credentials and the bound sfOrgId are kept (a
   * tenant only ever reconnects its own org); staff sessions are revoked, since nobody can
   * work against a disconnected org. Returns false when the organization doesn't exist.
   */
  async resetConnection(id: string, onboardingTokenHash: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.organization.updateMany({
        where: { id },
        data: { sfRefreshTokenEnc: null, connectionStatus: "pending", connectionError: null, onboardingTokenHash },
      });
      if (count === 0) return false;
      await revokeStaffSessions(tx, id);
      return true;
    });
  }

  /**
   * Deletes the tenant and everything the platform stores for it (staff, OAuth states,
   * audit log cascade; staff refresh tokens have no relation, so they go explicitly). Its data in
   * Salesforce is untouched. Returns false when the organization doesn't exist.
   */
  async deleteOrganization(id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const staff = await tx.staffUser.findMany({ where: { organizationId: id }, select: { id: true } });
      await tx.staffRefreshToken.deleteMany({ where: { staffUserId: { in: staff.map((s) => s.id) } } });
      const { count } = await tx.organization.deleteMany({ where: { id } });
      return count === 1;
    });
  }

  async create(input: { name: string; slug: string; onboardingTokenHash: string }): Promise<OrganizationRecord> {
    const slug = input.slug.toLowerCase();
    try {
      const record = await this.prisma.organization.create({
        data: { name: input.name, slug, onboardingTokenHash: input.onboardingTokenHash },
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

  /**
   * Salesforce issued a new refresh token during a refresh (rotation policy) — the old one is now
   * dead. Compare-and-swap: written only while `previousRefreshToken` is still the stored one, so a
   * slower instance can't overwrite a newer rotation. Returns whether it was written.
   */
  async saveRotatedRefreshToken(id: string, previousRefreshToken: string, refreshToken: string): Promise<boolean> {
    const storedCipher = await this.storedRefreshTokenCipherIf(id, previousRefreshToken);
    if (!storedCipher) return false;
    const { count } = await this.prisma.organization.updateMany({
      where: { id, sfRefreshTokenEnc: storedCipher },
      data: { sfRefreshTokenEnc: encryptSecret(refreshToken, this.masterKeyHex) },
    });
    return count === 1;
  }

  /**
   * Salesforce rejected `rejectedRefreshToken` — marks the org as needing a reconnect, unless the
   * stored token has since moved on (another instance rotated it), in which case the org is fine.
   * Returns whether the org was marked.
   */
  async recordRefreshTokenRejected(id: string, rejectedRefreshToken: string, message: string): Promise<boolean> {
    const storedCipher = await this.storedRefreshTokenCipherIf(id, rejectedRefreshToken);
    if (!storedCipher) return false;
    const { count } = await this.prisma.organization.updateMany({
      where: { id, sfRefreshTokenEnc: storedCipher },
      data: { connectionStatus: "error", connectionError: message },
    });
    return count === 1;
  }

  /** The stored refresh-token ciphertext when it decrypts to `refreshToken` (AES-GCM ciphertexts differ per encryption, so compare plaintexts). */
  private async storedRefreshTokenCipherIf(id: string, refreshToken: string): Promise<string | null> {
    const record = await this.prisma.organization.findUnique({ where: { id }, select: { sfRefreshTokenEnc: true } });
    const cipher = record?.sfRefreshTokenEnc;
    if (!cipher) return null;
    return decryptSecret(cipher, this.masterKeyHex) === refreshToken ? cipher : null;
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

async function revokeStaffSessions(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const staff = await tx.staffUser.findMany({ where: { organizationId }, select: { id: true } });
  await tx.staffRefreshToken.updateMany({
    where: { staffUserId: { in: staff.map((s) => s.id) }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
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
