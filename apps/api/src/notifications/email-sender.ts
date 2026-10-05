export const EMAIL_SENDER = Symbol("EmailSender");

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  plainText?: string;
}

/**
 * Outbound email port — the concrete provider is bound in InfrastructureModule. Implementations never
 * throw; they resolve to whether the provider accepted the message, so a job that must not lose a
 * send (reminders, follow-ups) can tell a delivered email from a swallowed failure.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<boolean>;
}
