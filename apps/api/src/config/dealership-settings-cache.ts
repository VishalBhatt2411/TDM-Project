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
  /** Loads under way, so a burst of requests for one cold key makes one call to the data provider. */
  private readonly loading = new Map<string, Promise<T>>();
  /** Bumped by every invalidation: a load that began before one holds a pre-edit value and must not be cached. */
  private epoch = 0;

  async getOrLoad(organizationId: string, dealershipId: string | undefined, load: () => Promise<T>): Promise<T> {
    const key = `${organizationId}:${dealershipId ?? ""}`;
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const inFlight = this.loading.get(key);
    if (inFlight) return inFlight;

    const startedAt = this.epoch;
    const pending = load()
      .then((value) => {
        if (startedAt === this.epoch) {
          if (this.entries.size >= MAX_CACHE_ENTRIES) this.entries.clear();
          this.entries.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
        }
        return value;
      })
      .finally(() => {
        if (this.loading.get(key) === pending) this.loading.delete(key);
      });
    this.loading.set(key, pending);
    return pending;
  }

  invalidate(organizationId: string, dealershipId?: string): void {
    this.epoch++;
    this.loading.clear();
    if (dealershipId) {
      this.entries.delete(`${organizationId}:${dealershipId}`);
      return;
    }
    const prefix = `${organizationId}:`;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }
}
