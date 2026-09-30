import { BadRequestException, Body, Controller, Get, Post, Put, Query, UseGuards } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { IsBase64, IsEmail, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { SITE_COPY_FIELDS, SITE_SECTION_KEYS } from "@tdm/domain";
import type { BrandAssetKind } from "@tdm/domain";
import { ALLOWED_IMAGE_CONTENT_TYPES } from "../common/image-signature";
import { BRAND_IMAGE_CONTENT_TYPES, MAX_BRAND_IMAGE_BYTES } from "../config/brand-assets";
import { StaffAuthGuard } from "./staff-auth.guard";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { CurrentStaff } from "./current-staff.decorator";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { PERMISSIONS } from "./permissions";
import { ConfigScopeQueryDto, ConfigScopeResolver } from "./config-scope";
import { AdminBrandingService } from "./admin-branding.service";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() || undefined : value);
const BRAND_ASSET_KINDS: readonly BrandAssetKind[] = ["logo", "hero"];
/** Base64 is 4 characters per 3 bytes. */
const MAX_IMAGE_BASE64_LENGTH = Math.ceil(Math.max(...Object.values(MAX_BRAND_IMAGE_BYTES)) / 3) * 4;

/** Lengths mirror the data provider's field sizes (Dealership__c / Company_Profile__c). */
const BRANDING_MAX_LENGTH = {
  tagline: 255,
  logoText: 40,
  logoUrl: 255,
  phone: 40,
  email: 80,
  address: 255,
  operatingHours: 4000,
} as const;

/** What the editor needs to render and pre-validate its form without duplicating the server's rules. */
const BRANDING_SCHEMA = {
  brandingMaxLength: BRANDING_MAX_LENGTH,
  copyMaxLength: SITE_COPY_FIELDS,
  sectionKeys: SITE_SECTION_KEYS,
  imageContentTypes: BRAND_IMAGE_CONTENT_TYPES,
  maxImageBytes: MAX_BRAND_IMAGE_BYTES,
};

class BrandingFieldsDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(BRANDING_MAX_LENGTH.tagline) tagline?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(BRANDING_MAX_LENGTH.logoText) logoText?: string;
  @IsOptional()
  @Transform(trim)
  @Matches(/^https:\/\/[^\s"'<>]+$/, { message: "logoUrl must be an https:// URL." })
  @MaxLength(BRANDING_MAX_LENGTH.logoUrl)
  logoUrl?: string;
  @IsOptional()
  @Transform(trim)
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: "primaryColorHex must be a 6-digit hex colour such as #1A73E8." })
  primaryColorHex?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(BRANDING_MAX_LENGTH.phone) phone?: string;
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(BRANDING_MAX_LENGTH.email) email?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(BRANDING_MAX_LENGTH.address) address?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(BRANDING_MAX_LENGTH.operatingHours) operatingHours?: string;
}

class SaveBrandingDto {
  @ValidateNested()
  @Type(() => BrandingFieldsDto)
  branding!: BrandingFieldsDto;

  /** Validated field by field by the domain's parseSiteContent. */
  @IsObject()
  content!: Record<string, unknown>;
}

class UploadBrandImageDto {
  @IsIn(BRAND_ASSET_KINDS)
  kind!: BrandAssetKind;

  @IsIn(ALLOWED_IMAGE_CONTENT_TYPES)
  contentType!: string;

  @IsString()
  @MaxLength(MAX_IMAGE_BASE64_LENGTH)
  @IsBase64()
  dataBase64!: string;
}

/** Customer-site branding and home-page content, company-wide or per dealership (never per branch). */
@Controller("admin/branding")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class AdminBrandingController {
  constructor(
    private readonly branding: AdminBrandingService,
    private readonly scopes: ConfigScopeResolver,
  ) {}

  @Get()
  async get(@Query() query: ConfigScopeQueryDto, @CurrentStaffAccess() access: StaffAccess) {
    return { ...(await this.branding.view(await this.resolveDealership(access, query))), schema: BRANDING_SCHEMA };
  }

  /** Replaces the whole layer at this scope — an omitted field is cleared and inherits again. */
  @Put()
  async save(
    @Query() query: ConfigScopeQueryDto,
    @Body() dto: SaveBrandingDto,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    const dealershipId = await this.resolveDealership(access, query);
    const view = await this.branding.save({ branding: { ...dto.branding }, content: dto.content }, dealershipId, staff.staffUserId);
    return { ...view, schema: BRANDING_SCHEMA };
  }

  @Post("images")
  async upload(@Query() query: ConfigScopeQueryDto, @Body() dto: UploadBrandImageDto, @CurrentStaffAccess() access: StaffAccess) {
    const dealershipId = await this.resolveDealership(access, query);
    return this.branding.upload(dto.kind, dto.contentType, dto.dataBase64, dealershipId);
  }

  private async resolveDealership(access: StaffAccess, query: ConfigScopeQueryDto): Promise<string | undefined> {
    if (query.branchId) throw new BadRequestException("Branding can't be customized per branch.");
    return (await this.scopes.resolve(access, query)).dealershipId;
  }
}
