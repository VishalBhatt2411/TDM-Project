/**
 * Read-only data provider for the Test Drive Management LWC dashboard.
 * All methods are cacheable — the dashboard is a visibility/reporting surface
 * for sales reps and managers, not a place bookings get edited (that happens
 * through the TDM web app, which writes back to these same objects).
 */
public with sharing class TDMDashboardController {

    @AuraEnabled(cacheable=true)
    public static DashboardKpis getKpis() {
        DashboardKpis kpis = new DashboardKpis();
        Datetime now = Datetime.now();
        Date monthStart = Date.today().toStartOfMonth();

        kpis.totalBookings = [SELECT COUNT() FROM Booking__c];

        kpis.upcomingCount = [
            SELECT COUNT() FROM Booking__c
            WHERE Scheduled_Start__c >= :now
            AND Status__c IN ('Requested', 'Confirmed', 'Waitlisted')
        ];

        kpis.completedThisMonth = [
            SELECT COUNT() FROM Booking__c
            WHERE Status__c = 'Completed' AND Scheduled_Start__c >= :monthStart
        ];

        kpis.cancelledThisMonth = [
            SELECT COUNT() FROM Booking__c
            WHERE Status__c IN ('Cancelled', 'NoShow') AND Scheduled_Start__c >= :monthStart
        ];

        Integer completedTotal = [SELECT COUNT() FROM Booking__c WHERE Status__c = 'Completed'];
        kpis.completionRate = kpis.totalBookings > 0
            ? (Decimal.valueOf(completedTotal) / kpis.totalBookings * 100).setScale(1)
            : 0;

        AggregateResult npsAgg = [
            SELECT AVG(NPS_Score__c) avgNps FROM Drive_Feedback__c
            WHERE Is_Survey_Response__c = true
        ];
        Object avgNpsRaw = npsAgg.get('avgNps');
        kpis.avgNps = avgNpsRaw != null ? ((Decimal) avgNpsRaw).setScale(1) : null;

        kpis.activeSalesReps = [SELECT COUNT() FROM Sales_Rep__c WHERE Is_Active__c = true];

        return kpis;
    }

    @AuraEnabled(cacheable=true)
    public static List<StatusCount> getStatusBreakdown() {
        Map<String, Integer> counts = new Map<String, Integer>();
        for (AggregateResult ar : [
            SELECT Status__c st, COUNT(Id) cnt FROM Booking__c GROUP BY Status__c
        ]) {
            counts.put((String) ar.get('st'), (Integer) ar.get('cnt'));
        }

        List<String> orderedStatuses = new List<String>{
            'Requested', 'Confirmed', 'Waitlisted', 'InProgress', 'Completed', 'Cancelled', 'NoShow'
        };
        List<StatusCount> result = new List<StatusCount>();
        for (String status : orderedStatuses) {
            if (counts.containsKey(status)) {
                StatusCount sc = new StatusCount();
                sc.status = status;
                sc.count = counts.get(status);
                result.add(sc);
            }
        }
        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<BookingRow> getUpcomingBookings(Integer maxRows) {
        Integer effectiveMax = maxRows == null || maxRows <= 0 ? 10 : maxRows;
        Datetime now = Datetime.now();
        List<BookingRow> rows = new List<BookingRow>();

        for (Booking__c b : [
            SELECT Name, Contact__r.FirstName, Contact__r.LastName, Vehicle__r.Make__c, Vehicle__r.Model__c,
                   Sales_Rep__r.Name, Branch__r.Name, Scheduled_Start__c, Status__c, Drive_Type__c
            FROM Booking__c
            WHERE Scheduled_Start__c >= :now
            AND Status__c IN ('Requested', 'Confirmed', 'Waitlisted')
            ORDER BY Scheduled_Start__c ASC
            LIMIT :effectiveMax
        ]) {
            BookingRow row = new BookingRow();
            row.bookingNumber = b.Name;
            row.customerName = trim(b.Contact__r.FirstName) + ' ' + trim(b.Contact__r.LastName);
            row.vehicleName = trim(b.Vehicle__r.Make__c) + ' ' + trim(b.Vehicle__r.Model__c);
            row.repName = b.Sales_Rep__r != null ? b.Sales_Rep__r.Name : 'Unassigned';
            row.branchName = b.Branch__r != null ? b.Branch__r.Name : '';
            row.scheduledStart = b.Scheduled_Start__c;
            row.status = b.Status__c;
            row.driveType = b.Drive_Type__c;
            rows.add(row);
        }
        return rows;
    }

    @AuraEnabled(cacheable=true)
    public static List<RepStat> getRepLeaderboard() {
        Map<Id, String> repNames = new Map<Id, String>();
        for (Sales_Rep__c rep : [SELECT Id, Name FROM Sales_Rep__c WHERE Is_Active__c = true]) {
            repNames.put(rep.Id, rep.Name);
        }

        Map<Id, Integer> totalByRep = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT Sales_Rep__c repId, COUNT(Id) cnt FROM Booking__c
            WHERE Sales_Rep__c != null GROUP BY Sales_Rep__c
        ]) {
            totalByRep.put((Id) ar.get('repId'), (Integer) ar.get('cnt'));
        }

        Map<Id, Integer> completedByRep = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT Sales_Rep__c repId, COUNT(Id) cnt FROM Booking__c
            WHERE Sales_Rep__c != null AND Status__c = 'Completed' GROUP BY Sales_Rep__c
        ]) {
            completedByRep.put((Id) ar.get('repId'), (Integer) ar.get('cnt'));
        }

        List<RepStat> stats = new List<RepStat>();
        for (Id repId : repNames.keySet()) {
            RepStat stat = new RepStat();
            stat.repName = repNames.get(repId);
            stat.totalBookings = totalByRep.containsKey(repId) ? totalByRep.get(repId) : 0;
            stat.completed = completedByRep.containsKey(repId) ? completedByRep.get(repId) : 0;
            stat.conversionRate = stat.totalBookings > 0
                ? (Decimal.valueOf(stat.completed) / stat.totalBookings * 100).setScale(0)
                : 0;
            stats.add(stat);
        }
        stats.sort();
        return stats;
    }

    private static String trim(String value) {
        return value == null ? '' : value;
    }

    public class DashboardKpis {
        @AuraEnabled public Integer totalBookings;
        @AuraEnabled public Integer upcomingCount;
        @AuraEnabled public Integer completedThisMonth;
        @AuraEnabled public Integer cancelledThisMonth;
        @AuraEnabled public Decimal completionRate;
        @AuraEnabled public Decimal avgNps;
        @AuraEnabled public Integer activeSalesReps;
    }

    public class StatusCount {
        @AuraEnabled public String status;
        @AuraEnabled public Integer count;
    }

    public class BookingRow {
        @AuraEnabled public String bookingNumber;
        @AuraEnabled public String customerName;
        @AuraEnabled public String vehicleName;
        @AuraEnabled public String repName;
        @AuraEnabled public String branchName;
        @AuraEnabled public Datetime scheduledStart;
        @AuraEnabled public String status;
        @AuraEnabled public String driveType;
    }

    public class RepStat implements Comparable {
        @AuraEnabled public String repName;
        @AuraEnabled public Integer totalBookings;
        @AuraEnabled public Integer completed;
        @AuraEnabled public Decimal conversionRate;

        public Integer compareTo(Object other) {
            RepStat that = (RepStat) other;
            return that.totalBookings - this.totalBookings;
        }
    }
}
