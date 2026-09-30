import { AssetPurpose, AssetRepository, StoredAsset } from "@tdm/domain";
import { PrismaClient } from "@prisma/client";

export class PostgresAssetRepository implements AssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(input: { contentType: string; data: Buffer; purpose: AssetPurpose; bookingId?: string }): Promise<{ id: string }> {
    const row = await this.prisma.uploadedAsset.create({
      data: { contentType: input.contentType, data: input.data, purpose: input.purpose, bookingId: input.bookingId },
    });
    return { id: row.id };
  }

  async findById(id: string): Promise<StoredAsset | null> {
    const row = await this.prisma.uploadedAsset.findUnique({ where: { id } });
    if (!row) return null;
    return {
      id: row.id,
      contentType: row.contentType,
      data: Buffer.from(row.data),
      purpose: row.purpose as AssetPurpose,
      bookingId: row.bookingId ?? undefined,
    };
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.uploadedAsset.deleteMany({ where: { id: { in: ids } } });
  }
}
