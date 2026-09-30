import { PrismaClient } from "@prisma/client";

/**
 * A staff member's local identity — the anchor for sessions and refresh tokens. Access (roles,
 * dealerships, branch) is never stored here: it is derived from the business-data provider's
 * staff assignments on every authorization, so revoking an assignment takes effect immediately.
 */
export interface StaffUserRecord {
  id: string;
  /** Owning tenant — every lookup outside a by-id read is scoped by it. */
  organizationId: string;
  /** The provider user id (a Salesforce User Id) — the id bookings are assigned to and assignments are keyed by. */
  salesforceUserId: string;
  email: string;
  name: string;
  createdAt: Date;
}

export class StaffUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<StaffUserRecord | null> {
    const record = await this.prisma.staffUser.findUnique({ where: { id } });
    return record ? toRecord(record) : null;
  }

  async findBySalesforceUserId(organizationId: string, salesforceUserId: string): Promise<StaffUserRecord | null> {
    const record = await this.prisma.staffUser.findUnique({
      where: { organizationId_salesforceUserId: { organizationId, salesforceUserId } },
    });
    return record ? toRecord(record) : null;
  }

  /**
   * Called on every successful sign-in: creates the local identity on first login and keeps its
   * email/name in sync with the provider afterwards. The composite key makes concurrent first
   * logins converge on one row.
   */
  async upsertFromIdentity(input: {
    organizationId: string;
    salesforceUserId: string;
    email: string;
    name: string;
  }): Promise<StaffUserRecord> {
    const email = input.email.toLowerCase();
    const record = await this.prisma.staffUser.upsert({
      where: {
        organizationId_salesforceUserId: { organizationId: input.organizationId, salesforceUserId: input.salesforceUserId },
      },
      create: { organizationId: input.organizationId, salesforceUserId: input.salesforceUserId, email, name: input.name },
      update: { email, name: input.name },
    });
    return toRecord(record);
  }
}

function toRecord(record: {
  id: string;
  organizationId: string;
  salesforceUserId: string;
  email: string;
  name: string;
  createdAt: Date;
}): StaffUserRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    salesforceUserId: record.salesforceUserId,
    email: record.email,
    name: record.name,
    createdAt: record.createdAt,
  };
}
