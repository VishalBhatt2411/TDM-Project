import { IsEmail, IsNotIn, IsOptional, IsUUID, IsString, Matches, MaxLength, MinLength } from "class-validator";

/**
 * Salesforce serves every login endpoint (login/test, My Domain, sandboxes, Experience Cloud)
 * under these domains. The wizard is public, so anything else is refused: the OAuth exchange
 * would send the tenant's Consumer Secret to that host.
 */
const SALESFORCE_LOGIN_URL = /^https:\/\/([a-z0-9-]+\.)+(salesforce\.com|force\.com|salesforce\.mil|cloudforce\.com)\/?$/i;
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

  /** Who is signing the company up — must prove they own it (see OnboardingService.verifyEmail) before the tenant goes live. */
  @IsEmail()
  @MaxLength(254)
  adminEmail!: string;
}

export class VerifyEmailDto {
  @IsUUID()
  organizationId!: string;

  @Matches(/^[a-f0-9]{64}$/, { message: "token is malformed" })
  token!: string;
}

export class SaveSalesforceCredentialsDto {
  @IsString()
  @MinLength(10)
  consumerKey!: string;

  @IsString()
  @MinLength(10)
  consumerSecret!: string;

  @IsOptional()
  @MaxLength(255)
  // A strict pattern, not a URL parser: validators and WHATWG URL disagree on `\`, `@` and ports,
  // which let `https://evil.test\@x.salesforce.com` through. Only a bare https origin is accepted.
  @Matches(SALESFORCE_LOGIN_URL, {
    message: "loginUrl must be your Salesforce login or My Domain URL, e.g. https://your-domain.my.salesforce.com",
  })
  loginUrl?: string;
}
