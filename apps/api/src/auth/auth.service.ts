import { randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthRepository, Customer, CustomerRepository, RefreshSession, Email, PersonName, PhoneNumber, TenantContextMissingError } from "@tdm/domain";
import { CustomerPasswordTokenRepository, generateOtpCode, hashSecret, MagicLoginRepository, sha256Hex, verifySecret } from "@tdm/postgres-adapter";
import type { CustomerDto } from "@tdm/types";
import { AUTH_REPOSITORY, CUSTOMER_PASSWORD_TOKEN_REPOSITORY, CUSTOMER_REPOSITORY, MAGIC_LOGIN_REPOSITORY } from "../infrastructure/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { ForgotPasswordDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto, UpdateProfileDto, VerifyOtpDto } from "./dto";
import { OTP_SENDER, OtpSender } from "./otp-sender";
import { ACCESS_TOKEN_TTL, AUTH_SCOPE, REFRESH_TOKEN_TTL, REFRESH_TOKEN_TTL_MS, SESSION_MAX_AGE_MS, TOKEN_TYPE } from "./auth.constants";
import { TenantContext } from "../tenancy/tenant-context";
import { runInBackground } from "../common/background-tasks";
import { errorCodeOf } from "../common/error-code";

const OTP_TTL_MINUTES = 10;
const MAGIC_LINK_TTL_MS = 48 * 60 * 60 * 1000;
const PASSWORD_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Verified against when the email is unknown, so a miss costs the same hashing time as a wrong password
// and response timing doesn't reveal which emails have accounts.
let unknownAccountHash: Promise<string> | undefined;
function decoyPasswordHash(): Promise<string> {
  unknownAccountHash ??= hashSecret(randomBytes(24).toString("hex"));
  return unknownAccountHash;
}

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

    // OtpSender is the delivery channel; today it is email (see EmailOtpSender).
    return { customerId: customer.id, otpChannel: "email" };
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
      await verifySecret(dto.password, await decoyPasswordHash());
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
    let payload: { sub: string; scope?: string; org?: string; typ?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; scope?: string; org?: string; typ?: string }>(dto.refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }
    if (payload.scope !== AUTH_SCOPE.CUSTOMER || payload.typ === TOKEN_TYPE.ACCESS) {
      throw new UnauthorizedException("This token is not valid for customer endpoints.");
    }
    // A customer id is a record in one tenant's org — its session is only ever valid on that tenant's host.
    TenantContext.bindSession(payload.org);
    // Single-use and atomic: of two concurrent refreshes with the same token, exactly one wins.
    const consumed = await this.authRepo.consumeRefreshToken(payload.sub, sha256Hex(dto.refreshToken));
    if (consumed.status === "reused") {
      // An already-rotated token came back: someone holds a copy. The repository has ended the whole session.
      this.logger.warn(JSON.stringify({ event: "refresh_token_reuse_detected", customerId: payload.sub }));
    }
    if (consumed.status !== "ok") {
      throw new UnauthorizedException("Refresh token has been revoked.");
    }
    if (Date.now() - consumed.session.startedAt.getTime() > SESSION_MAX_AGE_MS) {
      throw new UnauthorizedException("Your session has expired. Please sign in again.");
    }
    return this.issueTokens(payload.sub, consumed.session);
  }

  async logout(dto: RefreshDto): Promise<void> {
    let payload: { sub: string; scope?: string; org?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; scope?: string; org?: string }>(dto.refreshToken);
    } catch {
      return; // Expired or forged — nothing live to revoke.
    }
    if (payload.scope !== AUTH_SCOPE.CUSTOMER) return;
    try {
      TenantContext.bindSession(payload.org);
    } catch {
      return; // Another tenant's token — never revoke across tenants.
    }
    await this.authRepo.revokeRefreshToken(payload.sub, sha256Hex(dto.refreshToken));
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
    phone: PhoneNumber;
  }): Promise<Customer> {
    const customer = Customer.register({
      id: randomUUID(),
      name: PersonName.create(input.firstName, input.lastName),
      email: Email.create(input.email),
      phone: input.phone,
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
    // Never log the link itself — it is a bearer credential for this account.
    this.logger.log(JSON.stringify({ event: "magic_login_link_issued", customerId }));
    return `${this.customerSiteOrigin()}/magic-login?token=${rawToken}`;
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
    const siteOrigin = this.customerSiteOrigin();
    const rawToken = randomBytes(32).toString("hex");
    await this.passwordTokens.save(customerId, sha256Hex(rawToken), new Date(Date.now() + PASSWORD_TOKEN_TTL_MS));
    const setupUrl = `${siteOrigin}/set-password?token=${rawToken}`;
    this.logger.log(JSON.stringify({ event: "password_setup_link_issued", customerId, isNewAccount }));
    await this.notifications.sendPasswordSetup(email, name, setupUrl, isNewAccount);
  }

  /**
   * The company site the customer is on — sign-in links must return them there, not to a
   * shared origin that can't resolve their tenant. Customer routes always run on a resolved
   * host (TenantMiddleware fails closed otherwise), so a missing one is a programming error.
   */
  private customerSiteOrigin(): string {
    const origin = TenantContext.hostSiteOrigin();
    if (!origin) throw new Error("Customer links need a resolved company host.");
    return origin;
  }

  /** Always returns the same generic result whether or not the email exists, to avoid leaking which customer emails are registered. */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const customer = await this.customers.findByEmail(dto.email);
    if (customer) {
      const name = `${customer.name.firstName} ${customer.name.lastName}`;
      // Not awaited: the mail round-trip would make "account exists" measurably slower than "doesn't".
      runInBackground(this.issuePasswordSetupEmail(customer.id, customer.email.value, name, /* isNewAccount */ false)).catch((err) => {
        this.logger.error(JSON.stringify({ event: "password_reset_email_failed", customerId: customer.id, errorCode: errorCodeOf(err) }));
      });
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
    // A reset is how a compromised account gets recovered — sessions opened with the old password must end.
    await this.authRepo.revokeAllRefreshTokens(customerId);
    // Older emailed links (sign-in or reset) could still let in whoever holds them, so they die with the old password.
    await Promise.all([this.magicLoginRepo.revokeAllFor(customerId), this.passwordTokens.revokeAllFor(customerId)]);
    // The link went to the account's mailbox, which is the same proof the emailed OTP gives — so it also settles an
    // account that was never verified, rather than leaving its owner with a password they still can't sign in with.
    const customer = await this.customers.findById(customerId);
    if (customer && !customer.isFullyVerified) {
      customer.verifyEmail();
      customer.verifyPhone();
      await this.customers.save(customer);
    }
    return { success: true };
  }

  /** True if the customer has never set a real password (still on the system-generated one from auto-registration) — such an account must be offered password setup rather than a magic link, since a magic link is their only way in otherwise. */
  async needsPasswordSetup(customerId: string): Promise<boolean> {
    const credentials = await this.authRepo.findCredentials(customerId);
    return !credentials || credentials.isTemporary;
  }

  /** Backs GET /auth/me — lets an already-logged-in customer's known details (name/email/phone) pre-fill forms like booking, instead of re-asking for them. */
  async getProfile(customerId: string): Promise<CustomerDto> {
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new UnauthorizedException("Account no longer exists.");
    }
    return {
      id: customer.id,
      firstName: customer.name.firstName,
      lastName: customer.name.lastName,
      email: customer.email.value,
      phone: customer.phone.value,
      preferredLanguage: customer.preferredLanguage,
      marketingOptIn: customer.marketingOptIn,
      licenseVerified: !!customer.license?.verified,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  /** Backs PATCH /auth/me — name/language/marketing-opt-in only; email and phone stay fixed here since they're the verified identity the platform trusts (changing either would require re-verification, not a plain profile edit). */
  async updateProfile(customerId: string, dto: UpdateProfileDto): Promise<CustomerDto> {
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new UnauthorizedException("Account no longer exists.");
    }
    customer.updateProfile({
      name: dto.firstName || dto.lastName ? PersonName.create(dto.firstName ?? customer.name.firstName, dto.lastName ?? customer.name.lastName) : undefined,
      preferredLanguage: dto.preferredLanguage,
      marketingOptIn: dto.marketingOptIn,
    });
    await this.customers.save(customer);
    return this.getProfile(customerId);
  }

  private async issueOtp(customer: Customer): Promise<void> {
    const code = generateOtpCode();
    const codeHash = await hashSecret(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await this.authRepo.saveOtp(customer.id, codeHash, expiresAt);
    await this.otpSender.send({ email: customer.email.value, phone: customer.phone.value }, code, OTP_TTL_MINUTES);
  }

  private async issueTokens(customerId: string, session?: RefreshSession): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const organizationId = TenantContext.currentOrganizationId();
    if (!organizationId) throw new TenantContextMissingError();
    const identity = { sub: customerId, scope: AUTH_SCOPE.CUSTOMER, org: organizationId };
    const accessToken = this.jwtService.sign({ ...identity, typ: TOKEN_TYPE.ACCESS }, { expiresIn: ACCESS_TOKEN_TTL });
    // `jti` keeps two refresh tokens minted for one customer in the same second distinct —
    // they're stored by hash under a unique key, so identical tokens would collide.
    const refreshToken = this.jwtService.sign({ ...identity, typ: TOKEN_TYPE.REFRESH, jti: randomUUID() }, { expiresIn: REFRESH_TOKEN_TTL });
    await this.authRepo.saveRefreshToken(customerId, sha256Hex(refreshToken), new Date(Date.now() + REFRESH_TOKEN_TTL_MS), session);
    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }
}
