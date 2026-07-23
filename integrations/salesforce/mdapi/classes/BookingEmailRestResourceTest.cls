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
    }
}
