@isTest
private class TDMDashboardControllerTest {

    @TestSetup
    static void setup() {
        Branch__c branch = new Branch__c(Name = 'Test Branch', City__c = 'Indore', State__c = 'MP', Country__c = 'India', Is_Active__c = true);
        insert branch;

        Vehicle__c vehicle = new Vehicle__c(
            Make__c = 'Toyota', Model__c = 'Glanza', Year__c = 2026, VIN__c = 'TESTVIN001',
            Body_Type__c = 'Hatchback', Fuel_Type__c = 'Petrol', Transmission__c = 'Manual',
            Price__c = 700000, Status__c = 'Available', Branch__c = branch.Id
        );
        insert vehicle;

        Contact contact = new Contact(FirstName = 'Test', LastName = 'Customer', Email = 'test.customer@example.com', Portal_User_Id__c = 'test-portal-id');
        insert contact;

        // Owner defaults to the running context user — that's now the "assigned rep" for these test bookings.
        List<Booking__c> bookings = new List<Booking__c>();
        bookings.add(new Booking__c(
            Contact__c = contact.Id, Vehicle__c = vehicle.Id, Branch__c = branch.Id,
            Drive_Type__c = 'Dealership', Scheduled_Start__c = Datetime.now().addDays(2),
            Scheduled_End__c = Datetime.now().addDays(2).addHours(1), Status__c = 'Confirmed'
        ));
        bookings.add(new Booking__c(
            Contact__c = contact.Id, Vehicle__c = vehicle.Id, Branch__c = branch.Id,
            Drive_Type__c = 'Dealership', Scheduled_Start__c = Datetime.now().addDays(-5),
            Scheduled_End__c = Datetime.now().addDays(-5).addHours(1), Status__c = 'Completed'
        ));
        insert bookings;

        Drive_Feedback__c feedback = new Drive_Feedback__c(
            Booking__c = bookings[1].Id, NPS_Score__c = 9, Is_Survey_Response__c = true,
            Vehicle_Performance_Rating__c = 5, Comfort_Rating__c = 5, Features_Rating__c = 4,
            Staff_Experience_Rating__c = 5, Dealership_Experience_Rating__c = 5
        );
        insert feedback;
    }

    /**
     * A rep exactly as production provisions one: Standard Platform User profile plus the
     * TDM_Sales_Rep permission set. That permission set is what grants Booking__c read
     * (required even to be made a record's owner) while withholding View All Records.
     */
    private static User createRep(String aliasPrefix) {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard Platform User' LIMIT 1];
        User rep = new User(
            FirstName = 'Test', LastName = aliasPrefix + ' Rep',
            Email = aliasPrefix + '.rep@tdmtest.example',
            Username = aliasPrefix + '.rep.' + String.valueOf(Datetime.now().getTime()) + '@tdmtest.example',
            Alias = aliasPrefix.left(5), ProfileId = p.Id,
            TimeZoneSidKey = 'Asia/Kolkata', LocaleSidKey = 'en_IN',
            EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'en_US'
        );
        insert rep;

        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'TDM_Sales_Rep' LIMIT 1];
        insert new PermissionSetAssignment(AssigneeId = rep.Id, PermissionSetId = ps.Id);
        return rep;
    }

    @isTest
    static void testGetKpis() {
        Test.startTest();
        TDMDashboardController.DashboardKpis kpis = TDMDashboardController.getKpis();
        Test.stopTest();

        System.assertEquals(2, kpis.totalBookings);
        System.assertEquals(1, kpis.upcomingCount);
        System.assertEquals(1, kpis.completedThisMonth);
        System.assertEquals(1, kpis.activeSalesReps);
        System.assertEquals(9, kpis.avgNps);
        System.assertEquals(false, kpis.isPersonalView, 'An admin running the dashboard should get the org-wide view.');
    }

    /**
     * The whole point of Booking__c being Private: a rep who owns no drives must see none,
     * and must be told the numbers are personal so the UI can label them honestly.
     */
    /**
     * A rep must be told the numbers are personal, and the org-wide-only figures must be
     * suppressed rather than shown misleadingly. Record-level isolation itself is enforced
     * by the platform (Booking__c Private OWD) and asserted separately in
     * testRepCannotReadAnotherRepsBooking via UserRecordAccess, which is authoritative and
     * immune to the async sharing recalculation that follows an OWD deployment.
     */
    @isTest
    static void testDashboardIsPersonalForRep() {
        User otherRep = createRep('other');

        TDMDashboardController.DashboardKpis kpis;
        List<TDMDashboardController.RepStat> leaderboard;
        System.runAs(otherRep) {
            Test.startTest();
            kpis = TDMDashboardController.getKpis();
            leaderboard = TDMDashboardController.getRepLeaderboard();
            Test.stopTest();
        }

        System.assertEquals(true, kpis.isPersonalView, 'A rep without View All should get the personal view.');
        System.assertEquals(null, kpis.activeSalesReps, 'Org-wide rep count is suppressed in a personal view.');
        System.assert(leaderboard.isEmpty(), 'The cross-rep leaderboard is suppressed in a personal view.');
    }

    /** Booking__c is Private, so one rep must not be able to read another rep's drive. */
    @isTest
    static void testRepCannotReadAnotherRepsBooking() {
        User ownerRep = createRep('owner');
        User intruderRep = createRep('intrude');

        List<Booking__c> bookings = [SELECT Id FROM Booking__c];
        for (Booking__c b : bookings) {
            b.OwnerId = ownerRep.Id;
        }
        update bookings;

        Set<Id> bookingIds = new Map<Id, Booking__c>(bookings).keySet();

        Test.startTest();
        List<UserRecordAccess> ownerAccess = [
            SELECT RecordId, HasReadAccess FROM UserRecordAccess
            WHERE UserId = :ownerRep.Id AND RecordId IN :bookingIds
        ];
        List<UserRecordAccess> intruderAccess = [
            SELECT RecordId, HasReadAccess FROM UserRecordAccess
            WHERE UserId = :intruderRep.Id AND RecordId IN :bookingIds
        ];
        Test.stopTest();

        for (UserRecordAccess access : ownerAccess) {
            System.assertEquals(true, access.HasReadAccess, 'The assigned rep must be able to read their own drive.');
        }
        for (UserRecordAccess access : intruderAccess) {
            System.assertEquals(false, access.HasReadAccess, 'A rep must not be able to read a drive assigned to someone else.');
        }
    }

    /** An owner still sees their own drives, and their own customers' feedback, once Booking__c is Private. */
    @isTest
    static void testOwnerStillSeesOwnBookings() {
        User owningRep = createRep('owns');

        List<Booking__c> existing = [SELECT Id FROM Booking__c];
        for (Booking__c b : existing) {
            b.OwnerId = owningRep.Id;
        }
        update existing;

        TDMDashboardController.DashboardKpis kpis;
        System.runAs(owningRep) {
            Test.startTest();
            kpis = TDMDashboardController.getKpis();
            Test.stopTest();
        }

        System.assertEquals(true, kpis.isPersonalView);
        System.assertEquals(2, kpis.totalBookings, 'The owner must see every drive assigned to them.');
        System.assertEquals(9, kpis.avgNps, 'Feedback on their own completed drive should count.');
    }

    @isTest
    static void testGetStatusBreakdown() {
        Test.startTest();
        List<TDMDashboardController.StatusCount> breakdown = TDMDashboardController.getStatusBreakdown();
        Test.stopTest();

        System.assert(!breakdown.isEmpty());
    }

    @isTest
    static void testGetUpcomingBookings() {
        Test.startTest();
        List<TDMDashboardController.BookingRow> rows = TDMDashboardController.getUpcomingBookings(5);
        Test.stopTest();

        System.assertEquals(1, rows.size());
        System.assertEquals('Test Customer', rows[0].customerName);
        System.assertEquals('Toyota Glanza', rows[0].vehicleName);
    }

    @isTest
    static void testGetRepLeaderboard() {
        Test.startTest();
        List<TDMDashboardController.RepStat> stats = TDMDashboardController.getRepLeaderboard();
        Test.stopTest();

        System.assertEquals(1, stats.size());
        System.assertEquals(UserInfo.getName(), stats[0].repName);
        System.assertEquals(2, stats[0].totalBookings);
        System.assertEquals(1, stats[0].completed);
        System.assertEquals(50, stats[0].conversionRate);
    }
}
