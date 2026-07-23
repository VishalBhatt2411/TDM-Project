/**
 * Sends transactional emails on behalf of the TDM platform (booking confirmations,
 * cancellations, reminders, surveys, follow-ups). Salesforce is used as the sending
 * provider directly rather than introducing a third-party ESP, since Salesforce is
 * already the platform's system of record for customer/booking data.
 *
 * Note: Developer Edition orgs are subject to Salesforce's daily external email
 * sending limits — fine for dev/demo volume, but a real production deployment on a
 * higher-tier org (or a dedicated ESP) would be needed at scale.
 */
public with sharing class BookingEmailService {
    public class EmailResult {
        public Boolean success;
        public String message;

        public EmailResult(Boolean success, String message) {
            this.success = success;
            this.message = message;
        }
    }

    public static EmailResult sendHtmlEmail(
        String toAddress,
        String subject,
        String htmlBody,
        String plainTextBody,
        String senderDisplayName
    ) {
        if (String.isBlank(toAddress) || String.isBlank(subject) || String.isBlank(htmlBody)) {
            return new EmailResult(false, 'toAddress, subject, and htmlBody are all required.');
        }

        Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
        email.setToAddresses(new List<String>{ toAddress });
        email.setSubject(subject);
        email.setHtmlBody(htmlBody);
        email.setPlainTextBody(String.isNotBlank(plainTextBody) ? plainTextBody : htmlBody.stripHtmlTags());
        if (String.isNotBlank(senderDisplayName)) {
            email.setSenderDisplayName(senderDisplayName);
        }
        email.setSaveAsActivity(false);

        try {
            Messaging.SendEmailResult[] results = Messaging.sendEmail(
                new List<Messaging.SingleEmailMessage>{ email }
            );
            Messaging.SendEmailResult result = results[0];
            if (result.isSuccess()) {
                return new EmailResult(true, 'Email sent.');
            }
            String errors = '';
            for (Messaging.SendEmailError err : result.getErrors()) {
                errors += err.getMessage() + '; ';
            }
            return new EmailResult(false, errors);
        } catch (Exception ex) {
            return new EmailResult(false, ex.getMessage());
        }
    }
}
