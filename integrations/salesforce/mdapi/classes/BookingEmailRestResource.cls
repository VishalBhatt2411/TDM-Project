/**
 * Apex REST endpoint the NestJS API calls to send transactional emails through
 * Salesforce. POST /services/apexrest/tdm/sendEmail
 */
@RestResource(urlMapping='/tdm/sendEmail')
global with sharing class BookingEmailRestResource {

    public class SendEmailRequest {
        public String toAddress;
        public String subject;
        public String htmlBody;
        public String plainTextBody;
        public String senderDisplayName;
    }

    @HttpPost
    global static void sendEmail() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;

        res.addHeader('Content-Type', 'application/json');

        SendEmailRequest payload;
        try {
            // An empty body or a literal `null` deserializes to null rather than throwing.
            payload = req.requestBody == null
                ? null
                : (SendEmailRequest) JSON.deserialize(req.requestBody.toString(), SendEmailRequest.class);
        } catch (Exception ex) {
            reply(res, 400, new BookingEmailService.EmailResult(false, 'Invalid request body: ' + ex.getMessage()));
            return;
        }
        if (payload == null) {
            reply(res, 400, new BookingEmailService.EmailResult(false, 'Request body is required.'));
            return;
        }
        if (String.isBlank(payload.toAddress) || String.isBlank(payload.subject) || String.isBlank(payload.htmlBody)) {
            reply(res, 400, new BookingEmailService.EmailResult(false, 'toAddress, subject, and htmlBody are all required.'));
            return;
        }

        BookingEmailService.EmailResult result = BookingEmailService.sendHtmlEmail(
            payload.toAddress,
            payload.subject,
            payload.htmlBody,
            payload.plainTextBody,
            payload.senderDisplayName
        );
        reply(res, result.success ? 200 : 502, result);
    }

    /** Always serialized, never concatenated: an error message can contain quotes that would break hand-built JSON. */
    private static void reply(RestResponse res, Integer statusCode, BookingEmailService.EmailResult result) {
        res.statusCode = statusCode;
        res.responseBody = Blob.valueOf(JSON.serialize(result));
    }
}
