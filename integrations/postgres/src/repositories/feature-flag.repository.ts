import { FeatureFlagRepository } from "@tdm/domain";
import { PrismaClient } from "@prisma/client";

/** Branch-scoped flags are stored as a composite key ("key" or "key::branchId") — a
 *  pragmatic simplification for v1; a dedicated composite unique constraint is the
 *  natural next step if flag volume grows. */
function scopedKey(key: string, branchId?: string): string {
  return branchId ? `${key}::${branchId}` : key;
}

export class PostgresFeatureFlagRepository implements FeatureFlagRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isEnabled(key: string, context?: { branchId?: string }): Promise<boolean> {
    const record = await this.prisma.featureFlag.findUnique({
      where: { key: scopedKey(key, context?.branchId) },
    });
    if (record) return record.enabled;
    if (context?.branchId) {
      const global = await this.prisma.featureFlag.findUnique({ where: { key } });
      return global?.enabled ?? false;
    }
    return false;
  }

  async setFlag(key: string, enabled: boolean, context?: { branchId?: string }): Promise<void> {
    const compositeKey = scopedKey(key, context?.branchId);
    await this.prisma.featureFlag.upsert({
      where: { key: compositeKey },
      create: { key: compositeKey, enabled, branchId: context?.branchId },
      update: { enabled },
    });
  }
}
