import { PrismaClient } from "@prisma/client";

export interface DealershipConfig {
  name: string;
  tagline?: string;
  logoText?: string;
  phone?: string;
  email?: string;
  address?: string;
  operatingHours?: string;
  primaryColorHex?: string;
}

const DEFAULT_CONFIG: DealershipConfig = {
  name: "Toyota Indore",
  tagline: "Authorized Toyota Dealer",
  logoText: "TOYOTA",
  phone: "+91 731 400 0001",
  email: "contact@toyotaindore.example",
  address: "AB Road, Near LIG Square, Indore, Madhya Pradesh 452008",
  operatingHours: "Mon-Sat 9:00 AM - 8:00 PM, Sun 10:00 AM - 6:00 PM",
  primaryColorHex: "#EB0A1E",
};

export class DealershipConfigRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(): Promise<DealershipConfig> {
    const record = await this.prisma.dealershipConfig.findUnique({ where: { id: "default" } });
    if (!record) return DEFAULT_CONFIG;
    return {
      name: record.name,
      tagline: record.tagline ?? undefined,
      logoText: record.logoText ?? undefined,
      phone: record.phone ?? undefined,
      email: record.email ?? undefined,
      address: record.address ?? undefined,
      operatingHours: record.operatingHours ?? undefined,
      primaryColorHex: record.primaryColorHex ?? undefined,
    };
  }

  async update(config: Partial<DealershipConfig>): Promise<DealershipConfig> {
    const current = await this.get();
    const merged = { ...current, ...config };
    const record = await this.prisma.dealershipConfig.upsert({
      where: { id: "default" },
      create: { id: "default", ...merged },
      update: merged,
    });
    return {
      name: record.name,
      tagline: record.tagline ?? undefined,
      logoText: record.logoText ?? undefined,
      phone: record.phone ?? undefined,
      email: record.email ?? undefined,
      address: record.address ?? undefined,
      operatingHours: record.operatingHours ?? undefined,
      primaryColorHex: record.primaryColorHex ?? undefined,
    };
  }
}
