import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hashSecret, sha256Hex, StaffPasswordTokenRepository, StaffRefreshTokenRepository, StaffUserRepository, verifySecret } from "@tdm/postgres-adapter";
import {
  STAFF_PASSWORD_TOKEN_REPOSITORY,
  STAFF_REFRESH_TOKEN_REPOSITORY,
  STAFF_USER_REPOSITORY,
} from "../infrastructure/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { StaffForgotPasswordDto, StaffLoginDto, StaffRefreshDto, StaffResetPasswordDto } from "./dto";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @Inject(STAFF_USER_REPOSITORY) private readonly staffUsers: StaffUserRepository,
    @Inject(STAFF_PASSWORD_TOKEN_REPOSITORY) private readonly passwordTokens: StaffPasswordTokenRepository,
    @Inject(STAFF_REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: StaffRefreshTokenRepository,
    private readonly jwtService: JwtService,
    private readonly notifications: NotificationsService,
  ) {}

  async login(dto: StaffLoginDto): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const staff = await this.staffUsers.findByEmail(dto.email);
    if (!staff || !staff.isActive || !staff.passwordHash) {
      throw new UnauthorizedException("Invalid email or password.");
    }
    if (!(await verifySecret(dto.password, staff.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password.");
    }
    return this.issueTokens(staff.id, staff.role, staff.permissions);
  }

  /** Always returns the same generic result whether or not the email exists, to avoid leaking which staff emails are registered. */
  async forgotPassword(dto: StaffForgotPasswordDto): Promise<{ message: string }> {
    const staff = await this.staffUsers.findByEmail(dto.email);
    if (staff && staff.isActive) {
      await this.issuePasswordSetupEmail(staff.id, staff.email, staff.name, staff.role, /* isNewAccount */ !staff.passwordHash);
    }
    return { message: "If an account exists for that email, a reset link has been sent." };
  }

  async resetPassword(dto: StaffResetPasswordDto): Promise<{ success: boolean }> {
    const staffUserId = await this.passwordTokens.consume(sha256Hex(dto.token));
    if (!staffUserId) {
      throw new UnauthorizedException("This link is invalid or has expired.");
    }
    const passwordHash = await hashSecret(dto.newPassword);
    await this.staffUsers.setPasswordHash(staffUserId, passwordHash);
    return { success: true };
  }

  async refresh(dto: StaffRefreshDto): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    let payload: { sub: string; scope?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; scope?: string }>(dto.refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }
    if (payload.scope !== "staff") {
      throw new UnauthorizedException("This token is not valid for admin console endpoints.");
    }
    const isValid = await this.refreshTokens.isValid(payload.sub, sha256Hex(dto.refreshToken));
    if (!isValid) {
      throw new UnauthorizedException("Refresh token has been revoked.");
    }
    await this.refreshTokens.revoke(payload.sub, sha256Hex(dto.refreshToken));

    const staff = await this.staffUsers.findById(payload.sub);
    if (!staff || !staff.isActive) {
      throw new UnauthorizedException("Account is no longer active.");
    }
    return this.issueTokens(staff.id, staff.role, staff.permissions);
  }

  /** Used when an Admin creates a brand-new staff user (see AdminUsersService). */
  async issuePasswordSetupEmail(staffUserId: string, email: string, name: string, role: string, isNewAccount: boolean): Promise<void> {
    const rawToken = randomBytes(32).toString("hex");
    await this.passwordTokens.save(staffUserId, sha256Hex(rawToken), new Date(Date.now() + PASSWORD_TOKEN_TTL_MS));
    const webOrigin = process.env.ADMIN_WEB_ORIGIN ?? process.env.WEB_ORIGIN ?? "http://localhost:5173";
    const setupUrl = `${webOrigin}/admin/set-password?token=${rawToken}`;
    this.logger.log(`Password setup link for ${email}: ${setupUrl}`);
    await this.notifications.sendStaffPasswordSetup(email, name, role, setupUrl, isNewAccount);
  }

  private async issueTokens(
    staffUserId: string,
    role: string,
    permissions: string[],
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const payload = { sub: staffUserId, scope: "staff", role, permissions };
    const accessToken = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: "7d" });
    await this.refreshTokens.save(staffUserId, sha256Hex(refreshToken), new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }
}
