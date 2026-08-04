import { randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthRepository, Customer, CustomerRepository, Email, PersonName, PhoneNumber } from "@tdm/domain";
import { CustomerPasswordTokenRepository, generateOtpCode, hashSecret, MagicLoginRepository, sha256Hex, verifySecret } from "@tdm/postgres-adapter";
import { AUTH_REPOSITORY, CUSTOMER_PASSWORD_TOKEN_REPOSITORY, CUSTOMER_REPOSITORY, MAGIC_LOGIN_REPOSITORY } from "../infrastructure/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { ForgotPasswordDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto, VerifyOtpDto } from "./dto";
import { OTP_SENDER, OtpSender } from "./otp-sender";
import { ACCESS_TOKEN_TTL, AUTH_SCOPE, REFRESH_TOKEN_TTL, REFRESH_TOKEN_TTL_MS } from "./auth.constants";

const OTP_TTL_MINUTES = 10;
const MAGIC_LINK_TTL_MS = 48 * 60 * 60 * 1000;
const PASSWORD_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(AUTH_REPOSITORY) private readonly authRepo: AuthRepository,
    @Inject(MAGIC_LOGIN_REPOSITORY) private readonly magicLoginRepo: MagicLoginRepository,
    @Inject(CUSTOMER_PASSWORD_TOKEN_REPOSITORY) private readonly passwordTokens: CustomerPasswordTokenRepository,
    private readonly jwtService: JwtService,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSender,
    private readonly notifications: NotificationsService,
  ) {}

  async register(dto: RegisterDto): Promise<{ customerId: string; otpChannel: "sms" | "email" }> {
    const existing = await this.customers.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException("An account with this email already exists.");
    }

    const customer = Customer.register({
      id: randomUUID(),
      name: PersonName.create(dto.firstName, dto.lastName),
      email: Email.create(dto.email),
      phone: PhoneNumber.create(dto.phone),
      preferredLanguage: dto.preferredLanguage,
      marketingOptIn: dto.marketingOptIn,
    });
    await this.customers.save(customer);

    const passwordHash = await hashSecret(dto.password);
    await this.authRepo.saveCredentials({ customerId: customer.id, passwordHash, isTemporary: false });

    await this.issueOtp(customer);

    return { customerId: customer.id, otpChannel: "sms" };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{ verified: boolean }> {
    const ok = await this.authRepo.consumeOtp(dto.customerId, dto.code);
    if (!ok) {
      throw new BadRequestException("Invalid or expired OTP code.");
    }
    const customer = await this.customers.findById(dto.customerId);
    if (!customer) {
      throw new BadRequestException("Customer not found.");
    }
    customer.verifyEmail();
    customer.verifyPhone();
    await this.customers.save(customer);
    return { verified: true };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const customer = await this.customers.findByEmail(dto.email);
    if (!customer) {
      throw new UnauthorizedException("Invalid email or password.");
    }
    const credentials = await this.authRepo.findCredentials(customer.id);
    if (!credentials || !(await verifySecret(dto.password, credentials.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password.");
    }
    if (!customer.isFullyVerified) {
      throw new UnauthorizedException("Please verify your email and phone (OTP) before logging in.");
    }
    return this.issueTokens(customer.id);
  }

  async refresh(dto: RefreshDto): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    let payload: { sub: string; scope?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; scope?: string }>(dto.refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }
    if (payload.scope !== AUTH_SCOPE.CUSTOMER) {
      throw new UnauthorizedException("This token is not valid for customer endpoints.");
    }
    const isValid = await this.authRepo.isRefreshTokenValid(payload.sub, sha256Hex(dto.refreshToken));
    if (!isValid) {
      throw new UnauthorizedException("Refresh token has been revoked.");
    }
    await this.authRepo.revokeRefreshToken(payload.sub, sha256Hex(dto.refreshToken));
    return this.issueTokens(payload.sub);
  }

  /**
   * Creates an account inline as a side effect of a public (unauthenticated) test
   * drive booking — no separate register/verify-OTP step. The customer proves
   * ownership of their email after the fact by using the magic sign-in link we
   * send them, rather than blocking the booking on upfront verification.
   */
  async autoRegisterForBooking(input: {
    firstName: string;
    lastName: string;
    email: string;
    mobileNumber: string;
  }): Promise<Customer> {
    const customer = Customer.register({
      id: randomUUID(),
      name: PersonName.create(input.firstName, input.lastName),
      email: Email.create(input.email),
      phone: PhoneNumber.create(`+91${input.mobileNumber}`),
    });
    customer.verifyEmail();
    customer.verifyPhone();
    await this.customers.save(customer);

    const passwordHash = await hashSecret(randomBytes(24).toString("hex"));
    await this.authRepo.saveCredentials({ customerId: customer.id, passwordHash, isTemporary: true });

    return customer;
  }

  /** Returns the full magic-login URL (raw token in the query string; only the hash is stored). */
  async issueMagicLoginLink(customerId: string): Promise<string> {
    const rawToken = randomBytes(32).toString("hex");
    await this.magicLoginRepo.save(customerId, sha256Hex(rawToken), new Date(Date.now() + MAGIC_LINK_TTL_MS));
    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
    const link = `${webOrigin}/magic-login?token=${rawToken}`;
    this.logger.log(`Magic login link for ${customerId}: ${link}`);
    return link;
  }

  async verifyMagicLogin(token: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const customerId = await this.magicLoginRepo.consume(sha256Hex(token));
    if (!customerId) {
      throw new UnauthorizedException("This sign-in link is invalid or has expired.");
    }
    return this.issueTokens(customerId);
  }

  /**
   * Sends a one-time password-creation/reset link. Used both when a brand-new
   * customer account is auto-registered at booking time (isNewAccount = true, so
   * they end up with a real, memorable password instead of only a magic link)
   * and for customer-initiated forgot-password requests (isNewAccount = false).
   */
  async issuePasswordSetupEmail(customerId: string, email: string, name: string, isNewAccount: boolean): Promise<void> {
    const rawToken = randomBytes(32).toString("hex");
    await this.passwordTokens.save(customerId, sha256Hex(rawToken), new Date(Date.now() + PASSWORD_TOKEN_TTL_MS));
    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
    const setupUrl = `${webOrigin}/set-password?token=${rawToken}`;
    this.logger.log(`Password setup link for ${email}: ${setupUrl}`);
    await this.notifications.sendPasswordSetup(email, name, setupUrl, isNewAccount);
  }

  /** Always returns the same generic result whether or not the email exists, to avoid leaking which customer emails are registered. */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const customer = await this.customers.findByEmail(dto.email);
    if (customer) {
      const name = `${customer.name.firstName} ${customer.name.lastName}`;
      await this.issuePasswordSetupEmail(customer.id, customer.email.value, name, /* isNewAccount */ false);
    }
    return { message: "If an account exists for that email, a reset link has been sent." };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: boolean }> {
    const customerId = await this.passwordTokens.consume(sha256Hex(dto.token));
    if (!customerId) {
      throw new UnauthorizedException("This link is invalid or has expired.");
    }
    const passwordHash = await hashSecret(dto.newPassword);
    await this.authRepo.saveCredentials({ customerId, passwordHash, isTemporary: false });
    return { success: true };
  }

  /** True if the customer has never set a real password (still on the system-generated one from auto-registration) — such an account must be offered password setup rather than a magic link, since a magic link is their only way in otherwise. */
  async needsPasswordSetup(customerId: string): Promise<boolean> {
    const credentials = await this.authRepo.findCredentials(customerId);
    return !credentials || credentials.isTemporary;
  }

  private async issueOtp(customer: Customer): Promise<void> {
    const code = generateOtpCode();
    const codeHash = await hashSecret(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await this.authRepo.saveOtp(customer.id, codeHash, expiresAt);
    await this.otpSender.send({ email: customer.email.value, phone: customer.phone.value }, code);
  }

  private async issueTokens(customerId: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const accessToken = this.jwtService.sign({ sub: customerId, scope: AUTH_SCOPE.CUSTOMER }, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = this.jwtService.sign({ sub: customerId, scope: AUTH_SCOPE.CUSTOMER }, { expiresIn: REFRESH_TOKEN_TTL });
    await this.authRepo.saveRefreshToken(customerId, sha256Hex(refreshToken), new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }
}
