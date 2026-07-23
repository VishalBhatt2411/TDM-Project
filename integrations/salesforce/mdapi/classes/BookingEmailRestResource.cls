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

        SendEmailRequest payload;
        try {
            payload = (SendEmailRequest) JSON.deserialize(req.requestBody.toString(), SendEmailRequest.class);
        } catch (Exception ex) {
            res.statusCode = 400;
            res.responseBody = Blob.valueOf('{"success":false,"message":"Invalid request body: ' + ex.getMessage() + '"}');
            return;
        }

        BookingEmailService.EmailResult result = BookingEmailService.sendHtmlEmail(
            payload.toAddress,
            payload.subject,
            payload.htmlBody,
            payload.plainTextBody,
            payload.senderDisplayName
        );

        res.statusCode = result.success ? 200 : 502;
        res.responseBody = Blob.valueOf(JSON.serialize(result));
    }
}
