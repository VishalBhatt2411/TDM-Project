import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { AdminAuthService } from "./admin-auth.service";
import { StaffRefreshDto } from "./dto";

function adminWebOrigin(): string {
  return process.env.ADMIN_WEB_ORIGIN ?? process.env.WEB_ORIGIN ?? "http://localhost:5173";
}

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  /** Full-page navigation target for the "Login with Salesforce" button — not an XHR call. */
  @Get("salesforce/login")
  loginWithSalesforce(@Res() res: Response) {
    res.redirect(this.adminAuthService.buildAuthorizationUrl());
  }

  @Get("salesforce/callback")
  async salesforceCallback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    const result = await this.adminAuthService.handleCallback(code, state);
    if ("error" in result) {
      res.redirect(`${adminWebOrigin()}/admin/auth/callback?error=${result.error}`);
      return;
    }
    res.redirect(
      `${adminWebOrigin()}/admin/auth/callback#accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`,
    );
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: StaffRefreshDto) {
    return this.adminAuthService.refresh(dto);
  }
}
