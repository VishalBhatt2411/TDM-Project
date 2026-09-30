import { Injectable } from "@nestjs/common";
import { NotificationsService } from "../notifications/notifications.service";

export const OTP_SENDER = Symbol("OtpSender");

export interface OtpSender {
  send(destination: { email: string; phone: string }, code: string, ttlMinutes: number): Promise<void>;
}

/**
 * Delivers the OTP by email through the same NotificationsService/EmailSender pipeline as
 * every other transactional message. The code itself is never logged. Adding SMS/WhatsApp
 * delivery (FR-57) means providing another OtpSender implementation and rebinding
 * OTP_SENDER in AuthModule; nothing else in the app changes.
 */
@Injectable()
export class EmailOtpSender implements OtpSender {
  constructor(private readonly notifications: NotificationsService) {}

  async send(destination: { email: string; phone: string }, code: string, ttlMinutes: number): Promise<void> {
    await this.notifications.sendOtpCode(destination.email, code, ttlMinutes);
  }
}
