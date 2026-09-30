import { SalesforceConnectionSource } from "./connection-source";

export interface SalesforceEmailMessage {
  to: string;
  subject: string;
  html: string;
  plainText?: string;
}

export interface SalesforceEmailLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Sends real emails via the BookingEmailRestResource Apex endpoint deployed to the
 * current tenant's org — Salesforce is the sending provider, consistent with it being
 * the platform's business system of record. Never throws: automation flows must not
 * hard-crash on an email delivery hiccup, so failures are logged and swallowed.
 *
 * Note: Developer Edition orgs are subject to Salesforce's daily external-email
 * sending limits, so at high volume this would need a production-tier org or a
 * dedicated ESP — swappable behind the application's EmailSender port.
 */
export class SalesforceEmailSender {
  constructor(
    private readonly connectionSource: SalesforceConnectionSource,
    /** Per-tenant "From" display name — resolved per send, since one sender serves every tenant. */
    private readonly resolveSenderDisplayName: () => Promise<string>,
    private readonly logger: SalesforceEmailLogger,
  ) {}

  async send(message: SalesforceEmailMessage): Promise<void> {
    try {
      const conn = await this.connectionSource.getConnection();
      const senderDisplayName = await this.resolveSenderDisplayName();
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
          senderDisplayName,
        }),
        headers: { "Content-Type": "application/json" },
      });
      const response: { success: boolean; message: string } = typeof raw === "string" ? JSON.parse(raw) : (raw as any);
      if (!response.success) {
        this.logger.warn(JSON.stringify({ event: "email_send_rejected", provider: "salesforce", reason: response.message }));
      } else {
        this.logger.log(JSON.stringify({ event: "email_sent", provider: "salesforce" }));
      }
    } catch (err) {
      this.logger.error(JSON.stringify({ event: "email_send_failed", provider: "salesforce", reason: (err as Error).message }));
    }
  }
}
