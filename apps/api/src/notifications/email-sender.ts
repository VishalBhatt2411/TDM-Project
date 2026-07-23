import { Inject, Injectable, Logger } from "@nestjs/common";
import { SalesforceConnectionProvider } from "@tdm/salesforce-adapter";
import { SALESFORCE_CONNECTION_PROVIDER } from "../infrastructure/tokens";

export const EMAIL_SENDER = Symbol("EmailSender");

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  plainText?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Sends real emails via the BookingEmailRestResource Apex endpoint deployed to the
 * org — Salesforce is the sending provider, consistent with it being the platform's
 * business system of record. Falls back to console logging if the callout fails,
 * so automation flows never hard-crash on an email delivery hiccup.
 *
 * Note: Developer Edition orgs are subject to Salesforce's daily external-email
 * sending limits, so at high volume this would need a production-tier org or a
 * dedicated ESP — swappable behind this same interface.
 */
@Injectable()
export class SalesforceEmailSender implements EmailSender {
  private readonly logger = new Logger(SalesforceEmailSender.name);

  constructor(@Inject(SALESFORCE_CONNECTION_PROVIDER) private readonly connectionProvider: SalesforceConnectionProvider) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      const conn = await this.connectionProvider.getConnection();
      // jsforce returns the raw response body as a string for custom Apex REST
      // callouts rather than auto-parsing it — parse explicitly.
      const raw = await conn.request<string>({
        method: "POST",
        url: "/services/apexrest/tdm/sendEmail",
        body: JSON.stringify({
          toAddress: message.to,
          subject: message.subject,
          htmlBody: message.html,
          plainTextBody: message.plainText,
          senderDisplayName: "Toyota Indore Test Drives",
        }),
        headers: { "Content-Type": "application/json" },
      });
      const response: { success: boolean; message: string } = typeof raw === "string" ? JSON.parse(raw) : (raw as any);
      if (!response.success) {
        this.logger.warn(`Salesforce email send reported failure for ${message.to}: ${response.message}`);
      } else {
        this.logger.log(`Email sent via Salesforce to ${message.to}: "${message.subject}"`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${message.to} via Salesforce: ${err.message}`);
    }
  }
}
