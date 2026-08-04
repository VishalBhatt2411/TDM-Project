import { Inject, Injectable } from "@nestjs/common";
import { DealershipConfigRepository } from "@tdm/postgres-adapter";
import { DEALERSHIP_CONFIG_REPOSITORY } from "../infrastructure/tokens";
import { EMAIL_SENDER, EmailSender } from "./email-sender";
import {
  accountAccessEmail,
  BookingEmailContext,
  bookingConfirmationEmail,
  cancellationEmail,
  followUpEmail,
  passwordSetupEmail,
  reminderEmail,
  rescheduleEmail,
  staffAccessGrantedEmail,
  surveyRequestEmail,
} from "./email-templates";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(DEALERSHIP_CONFIG_REPOSITORY) private readonly dealershipConfig: DealershipConfigRepository,
  ) {}

  async sendBookingConfirmation(toEmail: string, ctx: BookingEmailContext): Promise<void> {
    const dealership = await this.dealershipConfig.get();
    const { subject, html } = bookingConfirmationEmail(dealership, ctx);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendAccountAccess(toEmail: string, customerName: string, magicLinkUrl: string): Promise<void> {
    const dealership = await this.dealershipConfig.get();
    const { subject, html } = accountAccessEmail(dealership, customerName, magicLinkUrl);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendCancellation(toEmail: string, ctx: BookingEmailContext, reason: string): Promise<void> {
    const dealership = await this.dealershipConfig.get();
    const { subject, html } = cancellationEmail(dealership, ctx, reason);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendReschedule(toEmail: string, ctx: BookingEmailContext, previousStart: Date): Promise<void> {
    const dealership = await this.dealershipConfig.get();
    const { subject, html } = rescheduleEmail(dealership, ctx, previousStart);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendReminder(toEmail: string, ctx: BookingEmailContext, kind: "24h" | "2h" | "day_of"): Promise<void> {
    const dealership = await this.dealershipConfig.get();
    const { subject, html } = reminderEmail(dealership, ctx, kind);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendFollowUp(toEmail: string, customerName: string, vehicleLabel: string, daysSince: number): Promise<void> {
    const dealership = await this.dealershipConfig.get();
    const { subject, html } = followUpEmail(dealership, customerName, vehicleLabel, daysSince);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendSurveyRequest(toEmail: string, customerName: string, vehicleLabel: string, surveyUrl: string): Promise<void> {
    const dealership = await this.dealershipConfig.get();
    const { subject, html } = surveyRequestEmail(dealership, customerName, vehicleLabel, surveyUrl);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendPasswordSetup(toEmail: string, customerName: string, setupUrl: string, isNewAccount: boolean): Promise<void> {
    const dealership = await this.dealershipConfig.get();
    const { subject, html } = passwordSetupEmail(dealership, customerName, setupUrl, isNewAccount);
    await this.emailSender.send({ to: toEmail, subject, html });
  }

  async sendStaffAccessGranted(toEmail: string, staffName: string, role: string, loginUrl: string): Promise<void> {
    const dealership = await this.dealershipConfig.get();
    const { subject, html } = staffAccessGrantedEmail(dealership, staffName, role, loginUrl);
    await this.emailSender.send({ to: toEmail, subject, html });
  }
}
