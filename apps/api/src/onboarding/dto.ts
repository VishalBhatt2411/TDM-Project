import { IsNotIn, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from "class-validator";
import { ORGANIZATION_SLUG_MAX_LENGTH, ORGANIZATION_SLUG_PATTERN, RESERVED_SUBDOMAIN_LABELS } from "../tenancy/organization-slug";

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(ORGANIZATION_SLUG_MAX_LENGTH)
  @Matches(ORGANIZATION_SLUG_PATTERN, { message: "slug must be lowercase letters, numbers, and single hyphens only" })
  @IsNotIn(RESERVED_SUBDOMAIN_LABELS, { message: "slug is reserved by the platform — choose another" })
  slug!: string;
}

export class SaveSalesforceCredentialsDto {
  @IsString()
  @MinLength(10)
  consumerKey!: string;

  @IsString()
  @MinLength(10)
  consumerSecret!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  loginUrl?: string;
}
