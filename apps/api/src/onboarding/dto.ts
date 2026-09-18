import { IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from "class-validator";

// Lowercase alphanumeric segments separated by single hyphens — reserved as this
// tenant's URL-safe identifier (e.g. future login routing: tdm.app/<slug>/admin/login).
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(63)
  @Matches(SLUG_PATTERN, { message: "slug must be lowercase letters, numbers, and single hyphens only" })
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
