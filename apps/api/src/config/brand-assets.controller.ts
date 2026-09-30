import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { SkipThrottle } from "@nestjs/throttler";
import { ParseRecordIdPipe } from "../common/record-id";
import { TenantContext } from "../tenancy/tenant-context";
import { BRAND_ASSET_ROUTE } from "./brand-assets";
import { BrandAssetService } from "./brand-asset.service";

/**
 * Public: a brand image of the tenant this host belongs to. Never serves any other kind of file.
 * Not rate limited: mail providers fetch every recipient's images from a few shared proxy IPs
 * (Gmail, Outlook), which the per-IP limit would block. Hits and misses are both served from
 * BrandAssetService's cache, so a flood doesn't reach the data provider.
 */
@SkipThrottle()
@Controller(BRAND_ASSET_ROUTE)
export class BrandAssetsController {
  constructor(private readonly assets: BrandAssetService) {}

  @Get(":id")
  async get(@Param("id", ParseRecordIdPipe) id: string, @Res() res: Response): Promise<void> {
    const organizationId = TenantContext.currentOrganizationId();
    if (!organizationId) throw new NotFoundException("Image not found.");
    const asset = await this.assets.read(organizationId, id);
    if (!asset) throw new NotFoundException("Image not found.");

    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Length", String(asset.data.length));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Emails and embeds on other origins may load a brand image; helmet defaults to same-origin.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.end(asset.data);
  }
}
