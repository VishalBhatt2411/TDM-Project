@isTest
private class BookingEmailRestResourceTest {

    @isTest
    static void sendsEmailViaRestEndpoint() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/tdm/sendEmail';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(
            '{"toAddress":"customer@example.com","subject":"Booking Confirmed","htmlBody":"<p>Confirmed</p>","senderDisplayName":"TDM"}'
        );
        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        BookingEmailRestResource.sendEmail();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode);
        String body = RestContext.response.responseBody.toString();
        System.assert(body.contains('"success":true'));
    }

    @isTest
    static void returnsBadRequestForInvalidJson() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/tdm/sendEmail';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf('not valid json');
        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        BookingEmailRestResource.sendEmail();
        Test.stopTest();

        System.assertEquals(400, RestContext.response.statusCode);
        // The error body must itself be valid JSON even though the parser's message contains quotes.
        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(RestContext.response.responseBody.toString());
        System.assertEquals(false, parsed.get('success'));
    }

    @isTest
    static void returnsBadRequestForNullBody() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/tdm/sendEmail';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf('null');
        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        BookingEmailRestResource.sendEmail();
        Test.stopTest();

        System.assertEquals(400, RestContext.response.statusCode);
    }

    @isTest
    static void returnsBadRequestForMissingFields() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/tdm/sendEmail';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf('{"toAddress":"customer@example.com"}');
        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        BookingEmailRestResource.sendEmail();
        Test.stopTest();

        System.assertEquals(400, RestContext.response.statusCode);
    }
}
