import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditLogRepository,
  BrandAssetKind,
  BrandAssetRepository,
  BrandLayer,
  BrandingRepository,
  DealershipBranding,
  DealershipRepository,
  EMPTY_BRAND_LAYER,
  brandLayerAssetIds,
  parseSiteContent,
} from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY, BRAND_ASSET_REPOSITORY, BRANDING_REPOSITORY, DEALERSHIP_REPOSITORY } from "../infrastructure/tokens";
import { BrandingService } from "../config/branding.service";
import { BrandAssetService } from "../config/brand-asset.service";
import { BRAND_IMAGE_CONTENT_TYPES, MAX_BRAND_IMAGE_BYTES, brandAssetPath } from "../config/brand-assets";
import { matchesImageSignature } from "../common/image-signature";
import { TenantContext } from "../tenancy/tenant-context";

export interface BrandingEditorView {
  /** The dealership's name, or the company's for the company-wide layer. */
  name: string;
  own: BrandLayer;
  /** What unset fields fall back to — the company layer when editing a dealership; null company-wide. */
  inherited: BrandLayer | null;
}

/** Content paths that reference an uploaded image, and the kind each must be. */
const ASSET_FIELDS: readonly { field: "logoAssetId" | "heroImageAssetId"; kind: BrandAssetKind }[] = [
  { field: "logoAssetId", kind: "logo" },
  { field: "heroImageAssetId", kind: "hero" },
];

function changedFields(before: BrandLayer, after: BrandLayer): string[] {
  const keys = new Set([...Object.keys(before.branding), ...Object.keys(after.branding)]) as Set<keyof DealershipBranding>;
  const changed: string[] = [...keys].filter((k) => before.branding[k] !== after.branding[k]);
  for (const key of ["logoAssetId", "heroImageUrl", "heroImageAssetId", "sections", "copy"] as const) {
    if (JSON.stringify(before.content[key] ?? null) !== JSON.stringify(after.content[key] ?? null)) changed.push(key);
  }
  return changed;
}

/**
 * Edits one scope's brand layer (a dealership's, or the company-wide one). The caller has
 * already verified the scope with ConfigScopeResolver; this owns validation that spans fields
 * (an image is a URL or an upload, never both; uploads must belong to this scope) and the
 * side effects of a save — audit entry, cache invalidation, removal of replaced uploads.
 */
@Injectable()
export class AdminBrandingService {
  constructor(
    @Inject(BRANDING_REPOSITORY) private readonly branding: BrandingRepository,
    @Inject(BRAND_ASSET_REPOSITORY) private readonly assets: BrandAssetRepository,
    @Inject(DEALERSHIP_REPOSITORY) private readonly dealerships: DealershipRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly brandingService: BrandingService,
    private readonly assetCache: BrandAssetService,
  ) {}

  async view(dealershipId: string | undefined): Promise<BrandingEditorView> {
    const [own, inherited, name] = await Promise.all([
      this.findLayer(dealershipId),
      dealershipId ? this.findLayer(undefined) : Promise.resolve(null),
      this.scopeName(dealershipId),
    ]);
    return { name, own, inherited };
  }

  async save(input: { branding: DealershipBranding; content: unknown }, dealershipId: string | undefined, actorId: string): Promise<BrandingEditorView> {
    const layer: BrandLayer = { branding: input.branding, content: parseSiteContent(input.content) };
    if (layer.branding.logoUrl && layer.content.logoAssetId) {
      throw new BadRequestException("Use either a logo URL or an uploaded logo, not both.");
    }
    for (const { field, kind } of ASSET_FIELDS) {
      const assetId = layer.content[field];
      if (!assetId) continue;
      const asset = await this.assets.describe(assetId);
      if (!asset || asset.kind !== kind || asset.dealershipId !== dealershipId) {
        throw new BadRequestException(`That ${kind} image doesn't belong to this ${dealershipId ? "dealership" : "company profile"} — upload it again.`);
      }
    }

    const before = await this.findLayer(dealershipId);
    await this.branding.saveLayer(layer, dealershipId);
    const organizationId = TenantContext.currentOrganizationId()!;
    this.brandingService.invalidate(organizationId, dealershipId);

    await this.auditLog.append({
      actorId,
      action: "BRANDING_UPDATED",
      entityType: "Branding",
      entityId: dealershipId ?? "company",
      metadata: { dealershipId: dealershipId ?? null, changedFields: changedFields(before, layer) },
    });

    const kept = new Set(brandLayerAssetIds(layer));
    const replaced = brandLayerAssetIds(before).filter((id) => !kept.has(id));
    if (replaced.length > 0) await this.deleteReplaced(organizationId, replaced, dealershipId);

    return this.view(dealershipId);
  }

  /** Stores an image for this scope without applying it — the editor previews it, then saves the layer referencing it. */
  async upload(kind: BrandAssetKind, contentType: string, dataBase64: string, dealershipId: string | undefined) {
    const allowedTypes: readonly string[] = BRAND_IMAGE_CONTENT_TYPES[kind];
    if (!allowedTypes.includes(contentType)) {
      throw new BadRequestException(`A ${kind} image must be one of: ${allowedTypes.join(", ")}.`);
    }
    const data = Buffer.from(dataBase64, "base64");
    if (data.length === 0) throw new BadRequestException("The image is empty.");
    const maxBytes = MAX_BRAND_IMAGE_BYTES[kind];
    if (data.length > maxBytes) throw new BadRequestException(`The ${kind} image must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.`);
    if (!matchesImageSignature(data, contentType)) throw new BadRequestException(`The file isn't a valid ${contentType} image.`);
    const { id } = await this.assets.save({ kind, contentType, data, dealershipId });
    return { assetId: id, url: brandAssetPath(id) };
  }

  private async findLayer(dealershipId: string | undefined): Promise<BrandLayer> {
    const layer = await this.branding.findLayer(dealershipId);
    if (!layer && dealershipId) throw new NotFoundException("Dealership not found.");
    return layer ?? EMPTY_BRAND_LAYER;
  }

  private async scopeName(dealershipId: string | undefined): Promise<string> {
    if (dealershipId) return (await this.dealerships.findById(dealershipId))?.toProps().name ?? "";
    return (await this.brandingService.resolve(undefined)).name;
  }

  /** Best effort: the save already succeeded, so a failed cleanup only leaves an unused file behind. */
  private async deleteReplaced(organizationId: string, assetIds: string[], dealershipId: string | undefined): Promise<void> {
    try {
      await this.assets.deleteMany(assetIds);
      this.assetCache.forget(organizationId, assetIds);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          event: "brand_asset_cleanup_failed",
          organizationId,
          dealershipId: dealershipId ?? null,
          assetIds,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}
