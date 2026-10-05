import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { timingSafeEqual } from "node:crypto";
import { Request, Response } from "express";
import { AdminAuthService } from "./admin-auth.service";
import { StaffAuthGuard, AuthenticatedStaff } from "./staff-auth.guard";
import { CurrentStaff } from "./current-staff.decorator";
import { setStaffAuthCookies, clearStaffAuthCookies, setOAuthStateCookie, clearOAuthStateCookie } from "./staff-auth-cookies.util";
import { parseCookieHeader } from "../common/cookie.util";
import { REFRESH_TOKEN_COOKIE, STAFF_OAUTH_STATE_COOKIE } from "../auth/auth.constants";
import { env } from "../common/env";
import { isValidOrganizationSlug } from "../tenancy/organization-slug";

// The `state` we hand out is always 24 random bytes as hex (see AdminAuthService.buildAuthorizationUrl).
const OAUTH_STATE_PATTERN = /^[a-f0-9]{48}$/;
const OAUTH_CODE_MAX_LENGTH = 2048;

function isValidOAuthCode(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= OAUTH_CODE_MAX_LENGTH;
}

function isValidOAuthState(value: unknown): value is string {
  return typeof value === "string" && OAUTH_STATE_PATTERN.test(value);
}

/** Both are fixed-length hex by now, so a length mismatch is simply "different". */
function sameState(a: string | undefined, b: string): boolean {
  return !!a && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

@Controller("admin/auth")
export class AdminAuthController {
  private readonly logger = new Logger(AdminAuthController.name);

  constructor(private readonly adminAuthService: AdminAuthService) {}

  /**
   * Full-page navigation target for the "Login with Salesforce" button — not an XHR call.
   * `org` is the company identifier (tenant slug); omitted, the company address's tenant is used.
   */
  @Get("salesforce/login")
  async loginWithSalesforce(@Query("org") org: unknown, @Res() res: Response) {
    if (org !== undefined && !isValidOrganizationSlug(org)) {
      res.redirect(`${env.adminWebOrigin}/admin/login?error=unknown_organization`);
      return;
    }
    const result = await this.adminAuthService.buildAuthorizationUrl(org);
    if (!result.ok) {
      res.redirect(`${env.adminWebOrigin}/admin/login?error=${result.error}`);
      return;
    }
    setOAuthStateCookie(res, result.state);
    res.redirect(result.url);
  }

  @Get("salesforce/callback")
  async salesforceCallback(@Query("code") code: unknown, @Query("state") state: unknown, @Req() req: Request, @Res() res: Response) {
    // Reject malformed input before it ever reaches Salesforce's token endpoint or
    // the database — this is a format check only, distinct from a *validly shaped
    // but expired/unknown* state, which is a normal user-facing OAuth error (handled
    // below via the ?error= redirect, not a raw 400).
    if (!isValidOAuthCode(code) || !isValidOAuthState(state)) {
      this.logger.warn(
        JSON.stringify({
          event: "admin_oauth_callback_rejected",
          reason: "malformed_parameters",
          ip: req.ip,
          timestamp: new Date().toISOString(),
        }),
      );
      throw new BadRequestException({ error: "invalid_request", message: "Malformed OAuth callback parameters." });
    }

    // Login CSRF guard: the state must have been issued to this very browser. Checked before the
    // state is consumed, so a forged callback can't burn the legitimate user's pending login.
    const boundState = parseCookieHeader(req.headers.cookie)[STAFF_OAUTH_STATE_COOKIE];
    clearOAuthStateCookie(res);
    if (!sameState(boundState, state)) {
      this.logger.warn(JSON.stringify({ event: "admin_oauth_callback_rejected", reason: "state_not_bound_to_browser", ip: req.ip }));
      res.redirect(`${env.adminWebOrigin}/admin/login?error=invalid_state`);
      return;
    }

    const result = await this.adminAuthService.handleCallback(code, state);
    if (!result.ok) {
      res.redirect(`${env.adminWebOrigin}/admin/login?error=${result.error}`);
      return;
    }

    setStaffAuthCookies(res, result.accessToken, result.refreshToken);
    res.redirect(`${env.adminWebOrigin}/admin`);
  }

  @Post("refresh")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = parseCookieHeader(req.headers.cookie)[REFRESH_TOKEN_COOKIE];
    const tokens = await this.adminAuthService.refresh(refreshToken);
    setStaffAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { expiresIn: tokens.expiresIn };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = parseCookieHeader(req.headers.cookie)[REFRESH_TOKEN_COOKIE];
    await this.adminAuthService.logout(refreshToken);
    clearStaffAuthCookies(res);
    return { success: true };
  }

  /** Lets the frontend determine login state/role/permissions from the backend — never from decoding a token client-side. */
  @Get("me")
  @UseGuards(StaffAuthGuard)
  async me(@CurrentStaff() staff: AuthenticatedStaff) {
    const profile = await this.adminAuthService.getProfile(staff);
    if (!profile) {
      throw new UnauthorizedException({ error: "inactive", message: "Account is no longer active." });
    }
    return profile;
  }
}
