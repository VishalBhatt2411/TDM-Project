@isTest
private class TDMDashboardControllerTest {

    @TestSetup
    static void setup() {
        Branch__c branch = new Branch__c(Name = 'Test Branch', City__c = 'Indore', State__c = 'MP', Country__c = 'India', Is_Active__c = true);
        insert branch;

        Sales_Rep__c rep = new Sales_Rep__c(Name = 'Test Rep', Email__c = 'test.rep@example.com', Is_Active__c = true, Max_Daily_Bookings__c = 8);
        insert rep;

        Vehicle__c vehicle = new Vehicle__c(
            Make__c = 'Toyota', Model__c = 'Glanza', Year__c = 2026, VIN__c = 'TESTVIN001',
            Body_Type__c = 'Hatchback', Fuel_Type__c = 'Petrol', Transmission__c = 'Manual',
            Price__c = 700000, Status__c = 'Available', Branch__c = branch.Id
        );
        insert vehicle;

        Contact contact = new Contact(FirstName = 'Test', LastName = 'Customer', Email = 'test.customer@example.com', Portal_User_Id__c = 'test-portal-id');
        insert contact;

        List<Booking__c> bookings = new List<Booking__c>();
        bookings.add(new Booking__c(
            Contact__c = contact.Id, Vehicle__c = vehicle.Id, Branch__c = branch.Id, Sales_Rep__c = rep.Id,
            Drive_Type__c = 'Dealership', Scheduled_Start__c = Datetime.now().addDays(2),
            Scheduled_End__c = Datetime.now().addDays(2).addHours(1), Status__c = 'Confirmed'
        ));
        bookings.add(new Booking__c(
            Contact__c = contact.Id, Vehicle__c = vehicle.Id, Branch__c = branch.Id, Sales_Rep__c = rep.Id,
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
        System.assertEquals('Test Rep', stats[0].repName);
        System.assertEquals(2, stats[0].totalBookings);
        System.assertEquals(1, stats[0].completed);
        System.assertEquals(50, stats[0].conversionRate);
    }
}
