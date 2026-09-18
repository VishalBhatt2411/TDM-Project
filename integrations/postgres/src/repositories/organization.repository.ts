import { PrismaClient } from "@prisma/client";

export type OrganizationConnectionStatus = "pending" | "connected" | "error";

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  sfConsumerKey: string | null;
  sfConsumerSecretEnc: string | null;
  sfRefreshTokenEnc: string | null;
  sfInstanceUrl: string | null;
  sfLoginUrl: string;
  sfOrgId: string | null;
  connectionStatus: OrganizationConnectionStatus;
  connectionError: string | null;
  metadataDeployedAt: Date | null;
  encryptionKeyVersion: number;
  createdAt: Date;
}

export class OrganizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<OrganizationRecord | null> {
    const record = await this.prisma.organization.findUnique({ where: { id } });
    return record ? toRecord(record) : null;
  }

  async findBySlug(slug: string): Promise<OrganizationRecord | null> {
    const record = await this.prisma.organization.findUnique({ where: { slug: slug.toLowerCase() } });
    return record ? toRecord(record) : null;
  }

  async create(input: { name: string; slug: string }): Promise<OrganizationRecord> {
    const record = await this.prisma.organization.create({
      data: { name: input.name, slug: input.slug.toLowerCase() },
    });
    return toRecord(record);
  }

  /** Consumer Key/Secret pasted in the onboarding wizard — the secret is already ciphertext by the time it reaches here (see crypto.ts). */
  async saveSalesforceCredentials(id: string, input: { consumerKey: string; consumerSecretEnc: string; loginUrl?: string }): Promise<void> {
    await this.prisma.organization.update({
      where: { id },
      data: {
        sfConsumerKey: input.consumerKey,
        sfConsumerSecretEnc: input.consumerSecretEnc,
        ...(input.loginUrl ? { sfLoginUrl: input.loginUrl } : {}),
      },
    });
  }

  /** Result of a successful OAuth handshake — refreshTokenEnc is already ciphertext. */
  async saveConnectionResult(
    id: string,
    input: { refreshTokenEnc: string; instanceUrl: string; sfOrgId: string },
  ): Promise<void> {
    await this.prisma.organization.update({
      where: { id },
      data: {
        sfRefreshTokenEnc: input.refreshTokenEnc,
        sfInstanceUrl: input.instanceUrl,
        sfOrgId: input.sfOrgId,
        connectionStatus: "connected",
        connectionError: null,
      },
    });
  }

  /** The OAuth handshake itself failed — the org is not connected. */
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

function toRecord(record: {
  id: string;
  name: string;
  slug: string;
  sfConsumerKey: string | null;
  sfConsumerSecretEnc: string | null;
  sfRefreshTokenEnc: string | null;
  sfInstanceUrl: string | null;
  sfLoginUrl: string;
  sfOrgId: string | null;
  connectionStatus: string;
  connectionError: string | null;
  metadataDeployedAt: Date | null;
  encryptionKeyVersion: number;
  createdAt: Date;
}): OrganizationRecord {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    sfConsumerKey: record.sfConsumerKey,
    sfConsumerSecretEnc: record.sfConsumerSecretEnc,
    sfRefreshTokenEnc: record.sfRefreshTokenEnc,
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
