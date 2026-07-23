import { Injectable, Logger } from "@nestjs/common";

export const OTP_SENDER = Symbol("OtpSender");

export interface OtpSender {
  send(destination: { email: string; phone: string }, code: string): Promise<void>;
}

/**
 * Dev-mode OTP delivery: logs the code instead of calling a real SMS/WhatsApp/email
 * gateway. Real functioning behavior for local development — swapping in Twilio/
 * WhatsApp Business API/SES later (Phase 1 FR-57) means providing another OtpSender
 * implementation and rebinding it in AuthModule; nothing else in the app changes.
 */
@Injectable()
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger(ConsoleOtpSender.name);

  async send(destination: { email: string; phone: string }, code: string): Promise<void> {
    this.logger.log(`OTP for ${destination.email} / ${destination.phone}: ${code}`);
  }
}
