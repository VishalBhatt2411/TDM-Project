import { Inject, Injectable } from "@nestjs/common";
import { BrandProfile, NotificationTemplateRepository } from "@tdm/domain";
import { NOTIFICATION_TEMPLATE_REPOSITORY } from "../infrastructure/tokens";
import { BrandingService } from "../config/branding.service";
import { TenantContext } from "../tenancy/tenant-context";
import { EMAIL_SENDER, EmailSender } from "./email-sender";
import {
  accountAccessEmail,
  BookingEmailContext,
  bookingConfirmationEmail,
  cancellationEmail,
  followUpEmail,
  NotificationTemplateKey,
  otpCodeEmail,
  passwordSetupEmail,
  reminderEmail,
  rescheduleEmail,
  salesRepAssignedEmail,
  surveyRequestEmail,
  TemplateOverride,
  waitlistedEmail,
  waitlistPromotedEmail,
} from "./email-templates";

type RenderedEmail = { subject: string; html: string };

/**
 * Sends transactional emails branded by the dealership they concern — a booking's own
 * dealership, or (for emails with no booking, e.g. an OTP) the host dealership the customer
 * is on — with that dealership's template overrides, else the company-wide ones.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY) private readonly templateOverrides: NotificationTemplateRepository,
    private readonly branding: BrandingService,
  ) {}

  private async send(
    toEmail: string,
    key: NotificationTemplateKey,
    dealershipId: string | undefined,
    render: (brand: BrandProfile, override?: TemplateOverride) => RenderedEmail,
  ): Promise<void> {
    const scopeDealershipId = dealershipId ?? TenantContext.hostDealershipId();
    const [brand, record] = await Promise.all([
      this.branding.resolveForEmail(scopeDealershipId),
      this.templateOverrides.findEffective(key, scopeDealershipId),
    ]);
    const { subject, html } = render(brand, record ? { subject: record.subject, note: record.note } : undefined);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  sendBookingConfirmation(toEmail: string, ctx: BookingEmailContext): Promise<void> {
    return this.send(toEmail, "bookingConfirmation", ctx.dealershipId, (brand, o) => bookingConfirmationEmail(brand, ctx, o));
  }

  sendAccountAccess(toEmail: string, customerName: string, magicLinkUrl: string): Promise<void> {
    return this.send(toEmail, "accountAccess", undefined, (brand, o) => accountAccessEmail(brand, customerName, magicLinkUrl, o));
  }

  sendCancellation(toEmail: string, ctx: BookingEmailContext, reason: string): Promise<void> {
    return this.send(toEmail, "cancellation", ctx.dealershipId, (brand, o) => cancellationEmail(brand, ctx, reason, o));
  }

  sendWaitlisted(toEmail: string, ctx: BookingEmailContext, position: number): Promise<void> {
    return this.send(toEmail, "waitlisted", ctx.dealershipId, (brand, o) => waitlistedEmail(brand, ctx, position, o));
  }

  sendWaitlistPromotion(toEmail: string, ctx: BookingEmailContext): Promise<void> {
    return this.send(toEmail, "waitlistPromoted", ctx.dealershipId, (brand, o) => waitlistPromotedEmail(brand, ctx, o));
  }

  sendReschedule(toEmail: string, ctx: BookingEmailContext, previousStart: Date): Promise<void> {
    return this.send(toEmail, "reschedule", ctx.dealershipId, (brand, o) => rescheduleEmail(brand, ctx, previousStart, o));
  }

  sendRepAssignment(toEmail: string, repName: string, ctx: BookingEmailContext): Promise<void> {
    return this.send(toEmail, "salesRepAssigned", ctx.dealershipId, (brand, o) => salesRepAssignedEmail(brand, repName, ctx, o));
  }

  sendReminder(toEmail: string, ctx: BookingEmailContext, kind: "24h" | "2h" | "day_of"): Promise<void> {
    return this.send(toEmail, "reminder", ctx.dealershipId, (brand, o) => reminderEmail(brand, ctx, kind, o));
  }

  sendFollowUp(toEmail: string, dealershipId: string, customerName: string, vehicleLabel: string, daysSince: number): Promise<void> {
    return this.send(toEmail, "followUp", dealershipId, (brand, o) => followUpEmail(brand, customerName, vehicleLabel, daysSince, o));
  }

  sendSurveyRequest(toEmail: string, dealershipId: string, customerName: string, vehicleLabel: string, surveyUrl: string): Promise<void> {
    return this.send(toEmail, "surveyRequest", dealershipId, (brand, o) => surveyRequestEmail(brand, customerName, vehicleLabel, surveyUrl, o));
  }

  sendPasswordSetup(toEmail: string, customerName: string, setupUrl: string, isNewAccount: boolean): Promise<void> {
    return this.send(toEmail, "passwordSetup", undefined, (brand, o) => passwordSetupEmail(brand, customerName, setupUrl, isNewAccount, o));
  }

  sendOtpCode(toEmail: string, code: string, ttlMinutes: number): Promise<void> {
    return this.send(toEmail, "otpCode", undefined, (brand, o) => otpCodeEmail(brand, code, ttlMinutes, o));
  }
}
