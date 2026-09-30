import { Inject, Injectable } from "@nestjs/common";
import { DealershipConfigRepository } from "@tdm/postgres-adapter";
import { NotificationTemplateRepository } from "@tdm/domain";
import { DEALERSHIP_CONFIG_REPOSITORY, NOTIFICATION_TEMPLATE_REPOSITORY } from "../infrastructure/tokens";
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

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(DEALERSHIP_CONFIG_REPOSITORY) private readonly dealershipConfig: DealershipConfigRepository,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY) private readonly templateOverrides: NotificationTemplateRepository,
  ) {}

  private async getOverride(key: NotificationTemplateKey): Promise<TemplateOverride | undefined> {
    const record = await this.templateOverrides.findByKey(key);
    return record ? { subject: record.subject, note: record.note } : undefined;
  }

  async sendBookingConfirmation(toEmail: string, ctx: BookingEmailContext): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("bookingConfirmation")]);
    const { subject, html } = bookingConfirmationEmail(dealership, ctx, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendAccountAccess(toEmail: string, customerName: string, magicLinkUrl: string): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("accountAccess")]);
    const { subject, html } = accountAccessEmail(dealership, customerName, magicLinkUrl, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendCancellation(toEmail: string, ctx: BookingEmailContext, reason: string): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("cancellation")]);
    const { subject, html } = cancellationEmail(dealership, ctx, reason, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendWaitlisted(toEmail: string, ctx: BookingEmailContext, position: number): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("waitlisted")]);
    const { subject, html } = waitlistedEmail(dealership, ctx, position, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendWaitlistPromotion(toEmail: string, ctx: BookingEmailContext): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("waitlistPromoted")]);
    const { subject, html } = waitlistPromotedEmail(dealership, ctx, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendReschedule(toEmail: string, ctx: BookingEmailContext, previousStart: Date): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("reschedule")]);
    const { subject, html } = rescheduleEmail(dealership, ctx, previousStart, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendRepAssignment(toEmail: string, repName: string, ctx: BookingEmailContext): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("salesRepAssigned")]);
    const { subject, html } = salesRepAssignedEmail(dealership, repName, ctx, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendReminder(toEmail: string, ctx: BookingEmailContext, kind: "24h" | "2h" | "day_of"): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("reminder")]);
    const { subject, html } = reminderEmail(dealership, ctx, kind, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendFollowUp(toEmail: string, customerName: string, vehicleLabel: string, daysSince: number): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("followUp")]);
    const { subject, html } = followUpEmail(dealership, customerName, vehicleLabel, daysSince, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendSurveyRequest(toEmail: string, customerName: string, vehicleLabel: string, surveyUrl: string): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("surveyRequest")]);
    const { subject, html } = surveyRequestEmail(dealership, customerName, vehicleLabel, surveyUrl, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendPasswordSetup(toEmail: string, customerName: string, setupUrl: string, isNewAccount: boolean): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("passwordSetup")]);
    const { subject, html } = passwordSetupEmail(dealership, customerName, setupUrl, isNewAccount, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendOtpCode(toEmail: string, code: string, ttlMinutes: number): Promise<void> {
    const [dealership, override] = await Promise.all([this.dealershipConfig.get(), this.getOverride("otpCode")]);
    const { subject, html } = otpCodeEmail(dealership, code, ttlMinutes, override);
    await this.emailSender.send({ to: toEmail, subject, html });
  }
}
