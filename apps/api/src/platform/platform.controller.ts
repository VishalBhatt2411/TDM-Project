import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CookieOptions, Response } from "express";
import { PLATFORM_OPERATOR_COOKIE, PLATFORM_OPERATOR_SESSION_TTL_SECONDS } from "../auth/auth.constants";
import { env } from "../common/env";
import { DeleteOrganizationDto, PlatformLoginDto } from "./dto";
import { PlatformOperatorGuard } from "./platform-operator.guard";
import { PlatformService } from "./platform.service";

const COOKIE_PATH = "/api/v1/platform";

function sessionCookieOptions(): CookieOptions {
  // Strict: nothing legitimate reaches the console through a cross-site navigation.
  return { httpOnly: true, secure: env.isProduction, sameSite: "strict", path: COOKIE_PATH };
}

/** Platform operator console — cross-tenant, password-protected, never linked from tenant UI. */
@Controller("platform")
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Post("session")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  async login(@Body() dto: PlatformLoginDto, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = await this.platform.login(dto.password);
    res.cookie(PLATFORM_OPERATOR_COOKIE, token, { ...sessionCookieOptions(), maxAge: PLATFORM_OPERATOR_SESSION_TTL_SECONDS * 1000 });
  }

  @Get("session")
  @UseGuards(PlatformOperatorGuard)
  session() {
    return { authenticated: true };
  }

  @Delete("session")
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(PLATFORM_OPERATOR_COOKIE, sessionCookieOptions());
  }

  @Get("organizations")
  @UseGuards(PlatformOperatorGuard)
  listOrganizations() {
    return this.platform.listOrganizations();
  }

  @Post("organizations/:organizationId/reconnect")
  @UseGuards(PlatformOperatorGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reconnect(@Param("organizationId", new ParseUUIDPipe()) organizationId: string) {
    return this.platform.reconnect(organizationId);
  }

  @Delete("organizations/:organizationId")
  @UseGuards(PlatformOperatorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  deleteOrganization(@Param("organizationId", new ParseUUIDPipe()) organizationId: string, @Body() dto: DeleteOrganizationDto): Promise<void> {
    return this.platform.deleteOrganization(organizationId, dto.confirmSlug);
  }
}
