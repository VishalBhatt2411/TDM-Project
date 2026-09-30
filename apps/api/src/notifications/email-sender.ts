export const EMAIL_SENDER = Symbol("EmailSender");

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  plainText?: string;
}

/** Outbound email port — the concrete provider is bound in InfrastructureModule. Implementations never throw. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
