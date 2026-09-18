import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { OnboardingService } from "./onboarding.service";
import { CreateOrganizationDto, SaveSalesforceCredentialsDto } from "./dto";

// Mirrors AdminAuthController's OAuth callback validation — the `state` we hand out
// is always 24 random bytes as hex (see OnboardingService.buildAuthorizationUrl).
const OAUTH_STATE_PATTERN = /^[a-f0-9]{48}$/;
const OAUTH_CODE_MAX_LENGTH = 2048;

function isValidOAuthCode(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= OAUTH_CODE_MAX_LENGTH;
}

function isValidOAuthState(value: unknown): value is string {
  return typeof value === "string" && OAUTH_STATE_PATTERN.test(value);
}

function onboardingWebOrigin(): string {
  return process.env.ADMIN_WEB_ORIGIN ?? process.env.WEB_ORIGIN ?? "http://localhost:5173";
}

/**
 * Self-service "Connect your Salesforce org" wizard — lets a new client company
 * onboard itself without any locally-authenticated Salesforce CLI session. Public
 * (unauthenticated) by design, same trust model as customer registration; guarded
 * by throttling and PKCE state validation rather than a login wall, since there is
 * no account to log into before an org exists.
 */
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post("organizations")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createOrganization(@Body() dto: CreateOrganizationDto) {
    return this.onboarding.createOrganization(dto);
  }

  @Post(":organizationId/salesforce-credentials")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  saveSalesforceCredentials(@Param("organizationId") organizationId: string, @Body() dto: SaveSalesforceCredentialsDto) {
    return this.onboarding.saveSalesforceCredentials(organizationId, dto);
  }

  /** Full-page navigation target for the wizard's "Authorize with Salesforce" step — not an XHR call. */
  @Get(":organizationId/salesforce/authorize")
  async authorize(@Param("organizationId") organizationId: string, @Res() res: Response) {
    res.redirect(await this.onboarding.buildAuthorizationUrl(organizationId));
  }

  @Get("salesforce/callback")
  async callback(@Query("code") code: unknown, @Query("state") state: unknown, @Res() res: Response) {
    if (!isValidOAuthCode(code) || !isValidOAuthState(state)) {
      throw new BadRequestException({ error: "invalid_request", message: "Malformed OAuth callback parameters." });
    }

    const result = await this.onboarding.handleCallback(code, state);
    if ("error" in result) {
      res.redirect(`${onboardingWebOrigin()}/onboarding?error=${result.error}`);
      return;
    }
    res.redirect(`${onboardingWebOrigin()}/onboarding/${result.organizationId}/connecting`);
  }

  @Get(":organizationId/status")
  getStatus(@Param("organizationId") organizationId: string) {
    return this.onboarding.getStatus(organizationId);
  }

  @Post(":organizationId/complete")
  complete(@Param("organizationId") organizationId: string) {
    return this.onboarding.completeOnboarding(organizationId);
  }
}
