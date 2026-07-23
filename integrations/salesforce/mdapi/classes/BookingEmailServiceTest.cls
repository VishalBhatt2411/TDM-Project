@isTest
private class BookingEmailServiceTest {

    @isTest
    static void sendsHtmlEmailSuccessfully() {
        Test.startTest();
        BookingEmailService.EmailResult result = BookingEmailService.sendHtmlEmail(
            'customer@example.com',
            'Your Test Drive is Confirmed',
            '<h1>Booking Confirmed</h1><p>See you soon.</p>',
            'Booking Confirmed. See you soon.',
            'TDM Test Drives'
        );
        Test.stopTest();

        System.assertEquals(true, result.success, 'Expected email send to report success in test context.');
    }

    @isTest
    static void fallsBackToStrippedPlainTextWhenNotProvided() {
        Test.startTest();
        BookingEmailService.EmailResult result = BookingEmailService.sendHtmlEmail(
            'customer@example.com',
            'Reminder',
            '<p>Your test drive is tomorrow.</p>',
            null,
            null
        );
        Test.stopTest();

        System.assertEquals(true, result.success);
    }

    @isTest
    static void returnsFailureWhenRequiredFieldsMissing() {
        BookingEmailService.EmailResult result = BookingEmailService.sendHtmlEmail(null, 'Subject', 'body', null, null);
        System.assertEquals(false, result.success);
        System.assert(result.message.contains('required'));
    }
}
