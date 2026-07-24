import { PrismaClient } from "@prisma/client";

export type StaffRole = "Admin" | "Manager" | "SalesRep";

export interface StaffUserRecord {
  id: string;
  email: string;
  name: string;
  salesforceUserId: string | null;
  role: StaffRole;
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
}

export class StaffUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<StaffUserRecord | null> {
    const record = await this.prisma.staffUser.findUnique({ where: { id } });
    return record ? toRecord(record) : null;
  }

  async findByEmail(email: string): Promise<StaffUserRecord | null> {
    const record = await this.prisma.staffUser.findUnique({ where: { email: email.toLowerCase() } });
    return record ? toRecord(record) : null;
  }

  async findAll(): Promise<StaffUserRecord[]> {
    const records = await this.prisma.staffUser.findMany({ orderBy: { createdAt: "asc" } });
    return records.map(toRecord);
  }

  async create(input: { email: string; name: string; role: StaffRole; permissions?: string[] }): Promise<StaffUserRecord> {
    const record = await this.prisma.staffUser.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        role: input.role,
        permissions: input.permissions ?? [],
      },
    });
    return toRecord(record);
  }

  /** Recorded just-in-time on a staff user's first successful Salesforce login — matching itself is by email, not this field. */
  async linkSalesforceUserId(id: string, salesforceUserId: string): Promise<void> {
    await this.prisma.staffUser.update({ where: { id }, data: { salesforceUserId } });
  }

  async updateRoleAndPermissions(id: string, input: { role?: StaffRole; permissions?: string[]; isActive?: boolean }): Promise<StaffUserRecord> {
    const record = await this.prisma.staffUser.update({ where: { id }, data: input });
    return toRecord(record);
  }
}

function toRecord(record: {
  id: string;
  email: string;
  name: string;
  salesforceUserId: string | null;
  role: string;
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
}): StaffUserRecord {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    salesforceUserId: record.salesforceUserId,
    role: record.role as StaffRole,
    permissions: record.permissions,
    isActive: record.isActive,
    createdAt: record.createdAt,
  };
}
