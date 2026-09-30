import { Inject, Injectable } from "@nestjs/common";
import { BrandAssetInfo, BrandAssetRepository } from "@tdm/domain";
import { BRAND_ASSET_REPOSITORY } from "../infrastructure/tokens";

type CachedAsset = (BrandAssetInfo & { data: Buffer }) | null;

/** Brand images are immutable (a new upload is a new asset), so a hit is served without touching the data provider. */
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 2000;
/** Unknown ids are remembered briefly, so a scan of made-up ids can't turn into data-provider API calls. */
const MISS_TTL_MS = 60_000;

/**
 * Serves public brand images through a byte-bounded LRU cache keyed per tenant — each image
 * would otherwise cost the tenant's data provider API calls on every page view.
 */
@Injectable()
export class BrandAssetService {
  private readonly cache = new Map<string, { asset: CachedAsset; expiresAt: number }>();
  private cachedBytes = 0;

  constructor(@Inject(BRAND_ASSET_REPOSITORY) private readonly assets: BrandAssetRepository) {}

  async read(organizationId: string, assetId: string): Promise<CachedAsset> {
    const key = `${organizationId}:${assetId}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit.asset;
    }
    if (hit) this.evict(key);

    const asset = await this.assets.read(assetId);
    this.store(key, asset);
    return asset;
  }

  /** Forgets deleted assets so they stop being served by this instance at once. */
  forget(organizationId: string, assetIds: readonly string[]): void {
    for (const id of assetIds) this.evict(`${organizationId}:${id}`);
  }

  private store(key: string, asset: CachedAsset): void {
    const size = asset?.data.length ?? 0;
    if (size > MAX_CACHE_BYTES) return;
    this.cache.set(key, { asset, expiresAt: asset ? Number.POSITIVE_INFINITY : Date.now() + MISS_TTL_MS });
    this.cachedBytes += size;
    for (const oldest of this.cache.keys()) {
      if (this.cachedBytes <= MAX_CACHE_BYTES && this.cache.size <= MAX_CACHE_ENTRIES) break;
      this.evict(oldest);
    }
  }

  private evict(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;
    this.cachedBytes -= entry.asset?.data.length ?? 0;
    this.cache.delete(key);
  }
}
