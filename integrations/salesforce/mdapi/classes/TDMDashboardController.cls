/**
 * Read-only data provider for the Test Drive Management LWC dashboard.
 * All methods are cacheable — the dashboard is a visibility/reporting surface
 * for sales reps and managers, not a place bookings get edited (that happens
 * through the TDM web app, which writes back to these same objects).
 *
 * Runs `with sharing`, and Booking__c is Private with the booking's Owner being its
 * assigned sales rep. That means every Booking__c query below is automatically scoped
 * to the drives the running user owns — a rep sees their own numbers, while a manager
 * or admin (View All Data / View All Bookings) sees the whole dealership. `isPersonalView`
 * tells the UI which of the two it's rendering so it can label things honestly.
 */
public with sharing class TDMDashboardController {

    /**
     * True when the running user only sees their own bookings. Checked against the user's
     * effective permissions rather than their role name, so it stays correct however
     * access is granted. PermissionSetAssignment includes the profile's own implicit
     * permission set, so this covers profile- and permission-set-granted access alike.
     */
    /** Keyed by user id, not a bare Boolean — otherwise a System.runAs block would read
     *  back the outer user's answer within the same transaction. */
    private static Map<Id, Boolean> isPersonalViewByUser = new Map<Id, Boolean>();
    private static Boolean isPersonalView() {
        Id currentUserId = UserInfo.getUserId();
        if (isPersonalViewByUser.containsKey(currentUserId)) {
            return isPersonalViewByUser.get(currentUserId);
        }
        Integer viewAllData = [
            SELECT COUNT() FROM PermissionSetAssignment
            WHERE AssigneeId = :currentUserId
            AND PermissionSet.PermissionsViewAllData = true
        ];
        Integer viewAllBookings = [
            SELECT COUNT() FROM ObjectPermissions
            WHERE ParentId IN (
                SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = :currentUserId
            )
            AND SobjectType = 'Booking__c'
            AND PermissionsViewAllRecords = true
        ];
        Boolean personal = viewAllData == 0 && viewAllBookings == 0;
        isPersonalViewByUser.put(currentUserId, personal);
        return personal;
    }

    @AuraEnabled(cacheable=true)
    public static DashboardKpis getKpis() {
        DashboardKpis kpis = new DashboardKpis();
        Datetime now = Datetime.now();
        Date today = Date.today();
        Date monthStart = today.toStartOfMonth();
        Boolean personal = isPersonalView();
        kpis.isPersonalView = personal;

        kpis.totalBookings = [SELECT COUNT() FROM Booking__c];

        kpis.upcomingCount = [
            SELECT COUNT() FROM Booking__c
            WHERE Scheduled_Start__c >= :now
            AND Status__c IN ('Requested', 'Confirmed', 'Waitlisted')
        ];

        // The single most useful number for a rep starting their shift.
        kpis.drivesToday = [
            SELECT COUNT() FROM Booking__c
            WHERE DAY_ONLY(Scheduled_Start__c) = :today
            AND Status__c IN ('Requested', 'Confirmed', 'InProgress')
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

        // Field reps deliberately have no direct Drive_Feedback__c access (that object holds
        // survey PII they work with through the TDM web app, not here). Apex isn't bound by
        // object-level CRUD, so this aggregate is the controlled exposure point — and it's
        // filtered to the running user's own drives so a rep only ever sees satisfaction for
        // customers they personally drove.
        Id currentUserId = UserInfo.getUserId();
        AggregateResult npsAgg = personal
            ? [
                SELECT AVG(NPS_Score__c) avgNps FROM Drive_Feedback__c
                WHERE Is_Survey_Response__c = true AND Booking__r.OwnerId = :currentUserId
              ]
            : [
                SELECT AVG(NPS_Score__c) avgNps FROM Drive_Feedback__c
                WHERE Is_Survey_Response__c = true
              ];
        Object avgNpsRaw = npsAgg.get('avgNps');
        kpis.avgNps = avgNpsRaw != null ? ((Decimal) avgNpsRaw).setScale(1) : null;

        // Bookings are assigned to real Salesforce Users (record Owner) rather than a
        // Sales_Rep__c record, so "active sales reps" is read as distinct booking owners.
        // Meaningless in a personal view (it would always be 1), so it's left null and the
        // UI drops the tile entirely rather than showing a misleading number.
        if (!personal) {
            AggregateResult distinctOwners = [SELECT COUNT_DISTINCT(OwnerId) c FROM Booking__c];
            kpis.activeSalesReps = (Integer) distinctOwners.get('c');
        }

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
            SELECT Name, Contact__r.FirstName, Contact__r.LastName, Contact__r.Phone,
                   Vehicle__r.Make__c, Vehicle__r.Model__c,
                   Owner.Name, Branch__r.Name, Scheduled_Start__c, Status__c, Drive_Type__c
            FROM Booking__c
            WHERE Scheduled_Start__c >= :now
            AND Status__c IN ('Requested', 'Confirmed', 'Waitlisted')
            ORDER BY Scheduled_Start__c ASC
            LIMIT :effectiveMax
        ]) {
            BookingRow row = new BookingRow();
            row.bookingNumber = b.Name;
            row.customerName = trim(b.Contact__r.FirstName) + ' ' + trim(b.Contact__r.LastName);
            row.customerPhone = b.Contact__r != null ? b.Contact__r.Phone : null;
            row.vehicleName = trim(b.Vehicle__r.Make__c) + ' ' + trim(b.Vehicle__r.Model__c);
            row.repName = b.Owner.Name;
            row.branchName = b.Branch__r != null ? b.Branch__r.Name : '';
            row.scheduledStart = b.Scheduled_Start__c;
            row.status = b.Status__c;
            row.driveType = b.Drive_Type__c;
            rows.add(row);
        }
        return rows;
    }

    /**
     * Leaderboard is keyed by the booking's Owner (a real Salesforce User) rather than a
     * Sales_Rep__c record. Returns empty for a rep-scoped viewer — a "leaderboard" of one
     * person is noise, and the UI hides the card rather than rendering a single row.
     */
    @AuraEnabled(cacheable=true)
    public static List<RepStat> getRepLeaderboard() {
        if (isPersonalView()) {
            return new List<RepStat>();
        }

        Map<Id, String> repNames = new Map<Id, String>();
        Map<Id, Integer> totalByRep = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT OwnerId, Owner.Name ownerName, COUNT(Id) cnt FROM Booking__c GROUP BY OwnerId, Owner.Name
        ]) {
            Id ownerId = (Id) ar.get('OwnerId');
            repNames.put(ownerId, (String) ar.get('ownerName'));
            totalByRep.put(ownerId, (Integer) ar.get('cnt'));
        }

        Map<Id, Integer> completedByRep = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT OwnerId, COUNT(Id) cnt FROM Booking__c WHERE Status__c = 'Completed' GROUP BY OwnerId
        ]) {
            completedByRep.put((Id) ar.get('OwnerId'), (Integer) ar.get('cnt'));
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
        @AuraEnabled public Integer drivesToday;
        @AuraEnabled public Integer completedThisMonth;
        @AuraEnabled public Integer cancelledThisMonth;
        @AuraEnabled public Decimal completionRate;
        @AuraEnabled public Decimal avgNps;
        /** Null in a personal view — the UI drops the tile rather than showing "1". */
        @AuraEnabled public Integer activeSalesReps;
        /** True when these numbers cover only the running user's own drives. */
        @AuraEnabled public Boolean isPersonalView;
    }

    public class StatusCount {
        @AuraEnabled public String status;
        @AuraEnabled public Integer count;
    }

    public class BookingRow {
        @AuraEnabled public String bookingNumber;
        @AuraEnabled public String customerName;
        @AuraEnabled public String customerPhone;
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
