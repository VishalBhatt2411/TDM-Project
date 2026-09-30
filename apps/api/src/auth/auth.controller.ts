import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthenticatedUser, JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { AuthService } from "./auth.service";
import {
  ForgotPasswordDto,
  LoginDto,
  MagicLoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyOtpDto,
} from "./dto";

/** Tighter-than-default limit for brute-forceable/abuse-prone auth endpoints (credential guessing, OTP guessing, email-bombing via forgot-password). */
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle(AUTH_THROTTLE)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** Lets the frontend pre-fill known details (e.g. the booking form) for an already-logged-in customer instead of re-asking for them. */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.customerId);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.customerId, dto);
  }

  @Post("verify-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  /** Revokes the presented refresh token. Always 204, so it reveals nothing about the token. */
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.authService.logout(dto);
  }

  @Post("magic-login")
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  magicLogin(@Body() dto: MagicLoginDto) {
    return this.authService.verifyMagicLogin(dto.token);
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
