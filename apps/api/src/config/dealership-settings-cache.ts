/** Settings edited straight in the data provider reach scheduling and formatting within this window. */
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1000;

/**
 * Short-lived cache of a resolved per-dealership setting, keyed by organization and dealership
 * (no dealership = company-wide). A company-wide edit drops every entry of that organization,
 * since each dealership inherits from it.
 */
export class DealershipSettingsCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  async getOrLoad(organizationId: string, dealershipId: string | undefined, load: () => Promise<T>): Promise<T> {
    const key = `${organizationId}:${dealershipId ?? ""}`;
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await load();
    if (this.entries.size >= MAX_CACHE_ENTRIES) this.entries.clear();
    this.entries.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  invalidate(organizationId: string, dealershipId?: string): void {
    if (dealershipId) {
      this.entries.delete(`${organizationId}:${dealershipId}`);
      return;
    }
    const prefix = `${organizationId}:`;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }
}
