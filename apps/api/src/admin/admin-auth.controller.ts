import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service";
import { StaffForgotPasswordDto, StaffLoginDto, StaffRefreshDto, StaffResetPasswordDto } from "./dto";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: StaffLoginDto) {
    return this.adminAuthService.login(dto);
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: StaffForgotPasswordDto) {
    return this.adminAuthService.forgotPassword(dto);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: StaffResetPasswordDto) {
    return this.adminAuthService.resetPassword(dto);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: StaffRefreshDto) {
    return this.adminAuthService.refresh(dto);
  }
}
