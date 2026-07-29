import { PrismaClient } from "@prisma/client";

export type StaffRole = "Admin" | "Manager" | "SalesRep";

export interface StaffUserRecord {
  id: string;
  email: string;
  name: string;
  /** Populated just-in-time on first successful Salesforce login — this IS the id bookings are assigned to (Booking__c.OwnerId). */
  salesforceUserId: string | null;
  role: StaffRole;
  permissions: string[];
  /** Dealership branch this rep operates out of — used for auto-assignment matching. */
  branchId: string | null;
  maxDailyBookings: number | null;
  phone: string | null;
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

  /** The Salesforce User id (Booking__c.OwnerId) a rep is assigned bookings under — only populated after their first login. */
  async findBySalesforceUserId(salesforceUserId: string): Promise<StaffUserRecord | null> {
    const record = await this.prisma.staffUser.findUnique({ where: { salesforceUserId } });
    return record ? toRecord(record) : null;
  }

  async findAll(): Promise<StaffUserRecord[]> {
    const records = await this.prisma.staffUser.findMany({ orderBy: { createdAt: "asc" } });
    return records.map(toRecord);
  }

  async create(input: {
    email: string;
    name: string;
    role: StaffRole;
    permissions?: string[];
    branchId?: string;
    maxDailyBookings?: number;
    phone?: string;
  }): Promise<StaffUserRecord> {
    const record = await this.prisma.staffUser.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        role: input.role,
        permissions: input.permissions ?? [],
        branchId: input.branchId ?? null,
        maxDailyBookings: input.maxDailyBookings ?? null,
        phone: input.phone ?? null,
      },
    });
    return toRecord(record);
  }

  /** Recorded just-in-time on a staff user's first successful Salesforce login — matching itself is by email, not this field. */
  async linkSalesforceUserId(id: string, salesforceUserId: string): Promise<void> {
    await this.prisma.staffUser.update({ where: { id }, data: { salesforceUserId } });
  }

  async update(
    id: string,
    input: {
      name?: string;
      email?: string;
      role?: StaffRole;
      permissions?: string[];
      branchId?: string | null;
      maxDailyBookings?: number | null;
      phone?: string | null;
      isActive?: boolean;
    },
  ): Promise<StaffUserRecord> {
    const record = await this.prisma.staffUser.update({
      where: { id },
      data: { ...input, email: input.email?.toLowerCase() },
    });
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
  branchId: string | null;
  maxDailyBookings: number | null;
  phone: string | null;
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
    branchId: record.branchId,
    maxDailyBookings: record.maxDailyBookings,
    phone: record.phone,
    isActive: record.isActive,
    createdAt: record.createdAt,
  };
}
