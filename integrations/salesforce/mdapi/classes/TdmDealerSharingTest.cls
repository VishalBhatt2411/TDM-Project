@isTest
private class TdmDealerSharingTest {

    private static User me() {
        return new User(Id = UserInfo.getUserId());
    }

    private static User staffUser(String alias) {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            FirstName = 'Test', LastName = alias,
            Email = alias + '@tdmtest.example',
            Username = alias + '.' + String.valueOf(Datetime.now().getTime()) + '@tdmtest.example',
            Alias = alias.left(8), ProfileId = p.Id,
            TimeZoneSidKey = 'Asia/Kolkata', LocaleSidKey = 'en_IN',
            EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'en_US'
        );
        insert u;
        return u;
    }

    /** Becoming a record's owner requires object read access, which staff get from their TDM permission set. */
    private static User staffUser(String alias, String permissionSetName) {
        User u = staffUser(alias);
        System.runAs(me()) {
            insert new PermissionSetAssignment(
                AssigneeId = u.Id,
                PermissionSetId = [SELECT Id FROM PermissionSet WHERE Name = :permissionSetName].Id
            );
        }
        return u;
    }

    private static Dealership__c dealership(String slug) {
        Dealership__c record = new Dealership__c(Name = 'Dealer ' + slug, Url_Slug__c = slug);
        insert record;
        return record;
    }

    /** Groups are setup objects; runAs isolates their DML from the business records inserted around it. */
    private static Map<String, Id> provisionGroups(Set<Id> dealershipIds) {
        System.runAs(me()) {
            TdmDealerGroups.ensure(dealershipIds);
        }
        return TdmDealerGroups.findGroupIds(dealershipIds);
    }

    private static Id groupOf(Map<String, Id> groupIds, Id dealershipId, TdmDealerGroups.Tier tier) {
        Id groupId = TdmDealerGroups.groupId(groupIds, dealershipId, tier);
        System.assertNotEquals(null, groupId, 'Expected a ' + tier + ' group for ' + dealershipId);
        return groupId;
    }

    private static Map<Id, String> sharesOf(String shareObject, Id parentId) {
        Map<Id, String> access = new Map<Id, String>();
        String rowCause = TdmRecordSharing.ROW_CAUSE;
        for (SObject share : Database.query(
            'SELECT UserOrGroupId, AccessLevel FROM ' + shareObject + ' WHERE ParentId = :parentId AND RowCause = :rowCause'
        )) {
            access.put((Id) share.get('UserOrGroupId'), (String) share.get('AccessLevel'));
        }
        return access;
    }

    private static Branch__c branch(Dealership__c owner) {
        Branch__c record = new Branch__c(Name = 'Main ' + owner.Url_Slug__c, Dealership__c = owner.Id);
        insert record;
        return record;
    }

    private static Vehicle__c vehicle(Branch__c site, String vin) {
        Vehicle__c record = new Vehicle__c(Make__c = 'Toyota', Model__c = 'Glanza', Year__c = 2026, VIN__c = vin, Branch__c = site.Id);
        insert record;
        return record;
    }

    private static Booking__c booking(Branch__c site, Vehicle__c unit) {
        Contact customer = new Contact(LastName = 'Customer', Email = 'customer.' + unit.VIN__c + '@tdmtest.example');
        insert customer;
        Booking__c record = new Booking__c(
            Contact__c = customer.Id, Vehicle__c = unit.Id, Branch__c = site.Id,
            Scheduled_Start__c = Datetime.now().addDays(1), Scheduled_End__c = Datetime.now().addDays(1).addHours(1)
        );
        insert record;
        return record;
    }

    @isTest
    static void dealershipInsertProvisionsNestedGroups() {
        Test.startTest();
        Dealership__c dealer = dealership('tdm-share-groups');
        Test.stopTest();

        Map<String, Id> groupIds = TdmDealerGroups.findGroupIds(new Set<Id>{ dealer.Id });
        Id staff = groupOf(groupIds, dealer.Id, TdmDealerGroups.Tier.STAFF);
        Id managers = groupOf(groupIds, dealer.Id, TdmDealerGroups.Tier.MANAGERS);
        Id admins = groupOf(groupIds, dealer.Id, TdmDealerGroups.Tier.ADMINS);

        System.assertEquals(1, [SELECT COUNT() FROM GroupMember WHERE GroupId = :staff AND UserOrGroupId = :managers], 'Managers nest in Staff.');
        System.assertEquals(1, [SELECT COUNT() FROM GroupMember WHERE GroupId = :managers AND UserOrGroupId = :admins], 'Admins nest in Managers.');
        System.assertEquals(false, [SELECT DoesIncludeBosses FROM Group WHERE Id = :staff].DoesIncludeBosses);
    }

    @isTest
    static void ensureIsIdempotentAndFollowsRename() {
        Dealership__c dealer = dealership('tdm-share-rename');
        provisionGroups(new Set<Id>{ dealer.Id });

        dealer.Name = 'Renamed Motors';
        update dealer;
        Set<Id> created;
        System.runAs(me()) {
            created = TdmDealerGroups.ensure(new Set<Id>{ dealer.Id });
        }

        System.assert(created.isEmpty(), 'No group is created twice.');
        Id staff = TdmDealerGroups.groupId(TdmDealerGroups.findGroupIds(new Set<Id>{ dealer.Id }), dealer.Id, TdmDealerGroups.Tier.STAFF);
        System.assertEquals('TDM Renamed Motors Staff', [SELECT Name FROM Group WHERE Id = :staff].Name);
        System.assertEquals(3, [SELECT COUNT() FROM Group WHERE DeveloperName LIKE :('TDM_' + String.valueOf(dealer.Id) + '%')]);
    }

    @isTest
    static void recordsAreSharedToTheirDealershipTiers() {
        Dealership__c dealer = dealership('tdm-share-records');
        Map<String, Id> groupIds = provisionGroups(new Set<Id>{ dealer.Id });
        Id staff = groupOf(groupIds, dealer.Id, TdmDealerGroups.Tier.STAFF);
        Id managers = groupOf(groupIds, dealer.Id, TdmDealerGroups.Tier.MANAGERS);
        Id admins = groupOf(groupIds, dealer.Id, TdmDealerGroups.Tier.ADMINS);
        User rep = staffUser('tdmrep1', 'TDM_Sales_Rep');

        Branch__c site = branch(dealer);
        Vehicle__c unit = vehicle(site, 'TDMSHAREVIN01');
        Booking__c drive = booking(site, unit);
        drive.OwnerId = rep.Id;
        update drive;
        Drive_Feedback__c feedback = new Drive_Feedback__c(Booking__c = drive.Id, NPS_Score__c = 8);
        insert feedback;

        System.assertEquals(dealer.Id, [SELECT Dealership__c FROM Vehicle__c WHERE Id = :unit.Id].Dealership__c, 'Vehicle inherits its branch dealership.');
        System.assertEquals(dealer.Id, [SELECT Dealership__c FROM Booking__c WHERE Id = :drive.Id].Dealership__c, 'Booking inherits its branch dealership.');

        Map<Id, String> branchShares = sharesOf('Branch__Share', site.Id);
        System.assertEquals('Read', branchShares.get(staff));
        System.assertEquals('Edit', branchShares.get(admins));
        Map<Id, String> vehicleShares = sharesOf('Vehicle__Share', unit.Id);
        System.assertEquals('Read', vehicleShares.get(staff));
        System.assertEquals('Edit', vehicleShares.get(managers));
        Map<Id, String> bookingShares = sharesOf('Booking__Share', drive.Id);
        System.assertEquals('Edit', bookingShares.get(managers));
        System.assert(!bookingShares.containsKey(staff), 'Reps see only drives they own, never the whole dealership.');
        Map<Id, String> feedbackShares = sharesOf('Drive_Feedback__Share', feedback.Id);
        System.assertEquals('Edit', feedbackShares.get(managers));
        System.assertEquals('Edit', feedbackShares.get(rep.Id), 'The assigned rep works their drive feedback.');
    }

    @isTest
    static void movingBookingResharesItAndItsChildren() {
        Dealership__c first = dealership('tdm-share-first');
        Dealership__c second = dealership('tdm-share-second');
        Map<String, Id> groupIds = provisionGroups(new Set<Id>{ first.Id, second.Id });
        Branch__c firstSite = branch(first);
        Branch__c secondSite = branch(second);
        Vehicle__c firstUnit = vehicle(firstSite, 'TDMSHAREVIN02');
        Vehicle__c secondUnit = vehicle(secondSite, 'TDMSHAREVIN03');
        Booking__c drive = booking(firstSite, firstUnit);
        Compliance_Record__c compliance = new Compliance_Record__c(Booking__c = drive.Id);
        insert compliance;

        drive.Branch__c = secondSite.Id;
        drive.Vehicle__c = secondUnit.Id;
        drive.Dealership__c = second.Id;
        update drive;

        Id oldManagers = groupOf(groupIds, first.Id, TdmDealerGroups.Tier.MANAGERS);
        Id newManagers = groupOf(groupIds, second.Id, TdmDealerGroups.Tier.MANAGERS);
        Map<Id, String> bookingShares = sharesOf('Booking__Share', drive.Id);
        System.assert(!bookingShares.containsKey(oldManagers), 'The previous dealership loses the drive.');
        System.assertEquals('Edit', bookingShares.get(newManagers));
        Map<Id, String> complianceShares = sharesOf('Compliance_Record__Share', compliance.Id);
        System.assert(!complianceShares.containsKey(oldManagers));
        System.assertEquals('Edit', complianceShares.get(newManagers));
    }

    @isTest
    static void transfersAreSharedWithBothDealerships() {
        Dealership__c origin = dealership('tdm-share-origin');
        Dealership__c target = dealership('tdm-share-target');
        Map<String, Id> groupIds = provisionGroups(new Set<Id>{ origin.Id, target.Id });
        Branch__c originSite = branch(origin);
        Branch__c targetSite = branch(target);
        Vehicle__c unit = vehicle(originSite, 'TDMSHAREVIN05');

        Vehicle_Allocation__c transfer = new Vehicle_Allocation__c(Vehicle__c = unit.Id, From_Branch__c = originSite.Id, To_Branch__c = targetSite.Id);
        insert transfer;

        Map<Id, String> shares = sharesOf('Vehicle_Allocation__Share', transfer.Id);
        System.assertEquals('Edit', shares.get(groupOf(groupIds, origin.Id, TdmDealerGroups.Tier.MANAGERS)));
        System.assertEquals('Edit', shares.get(groupOf(groupIds, target.Id, TdmDealerGroups.Tier.MANAGERS)));
    }

    @isTest
    static void rejectsCrossDealershipAndMissingDealership() {
        Dealership__c home = dealership('tdm-share-home');
        Dealership__c away = dealership('tdm-share-away');
        Branch__c homeSite = branch(home);
        Vehicle__c awayUnit = vehicle(branch(away), 'TDMSHAREVIN04');
        Contact customer = new Contact(LastName = 'Customer', Email = 'cross@tdmtest.example');
        insert customer;

        Database.SaveResult crossBooking = Database.insert(new Booking__c(
            Contact__c = customer.Id, Vehicle__c = awayUnit.Id, Branch__c = homeSite.Id,
            Scheduled_Start__c = Datetime.now().addDays(1), Scheduled_End__c = Datetime.now().addDays(1).addHours(1)
        ), false);
        System.assertEquals(false, crossBooking.isSuccess(), 'A booking may not use another dealership\'s vehicle.');

        Database.SaveResult orphanBranch = Database.insert(new Branch__c(Name = 'Orphan'), false);
        System.assertEquals(false, orphanBranch.isSuccess(), 'Every branch belongs to a dealership.');
    }

    @isTest
    static void staffSyncFollowsAssignments() {
        Dealership__c dealer = dealership('tdm-share-staff');
        Map<String, Id> groupIds = provisionGroups(new Set<Id>{ dealer.Id });
        Id managers = groupOf(groupIds, dealer.Id, TdmDealerGroups.Tier.MANAGERS);
        User manager = staffUser('tdmmgr1');
        Id managerPs = [SELECT Id FROM PermissionSet WHERE Name = 'TDM_Manager'].Id;

        Staff_Assignment__c assignment = new Staff_Assignment__c(User__c = manager.Id, Role__c = 'Manager', Dealership__c = dealer.Id);
        insert assignment;
        System.assertEquals('Read', sharesOf('Staff_Assignment__Share', assignment.Id).get(manager.Id), 'Staff can read their own assignment.');

        Set<Id> userIds = new Set<Id>{ manager.Id };
        System.runAs(me()) {
            new TdmStaffAccessSync(userIds).execute(null);
        }
        System.assertEquals(1, [SELECT COUNT() FROM GroupMember WHERE GroupId = :managers AND UserOrGroupId = :manager.Id]);
        System.assertEquals(1, [SELECT COUNT() FROM PermissionSetAssignment WHERE AssigneeId = :manager.Id AND PermissionSetId = :managerPs]);

        assignment.Is_Active__c = false;
        update assignment;
        System.runAs(me()) {
            new TdmStaffAccessSync(userIds).execute(null);
        }
        System.assertEquals(0, [SELECT COUNT() FROM GroupMember WHERE GroupId = :managers AND UserOrGroupId = :manager.Id], 'Deactivation revokes dealership access.');
        System.assertEquals(0, [SELECT COUNT() FROM PermissionSetAssignment WHERE AssigneeId = :manager.Id AND PermissionSetId = :managerPs]);
    }

    @isTest
    static void assignmentChangeEnqueuesSync() {
        Dealership__c dealer = dealership('tdm-share-async');
        provisionGroups(new Set<Id>{ dealer.Id });
        User rep = staffUser('tdmrep2');
        Branch__c site = branch(dealer);

        Test.startTest();
        insert new Staff_Assignment__c(User__c = rep.Id, Role__c = 'Sales_Rep', Dealership__c = dealer.Id, Branch__c = site.Id);
        Test.stopTest();

        Id staff = TdmDealerGroups.groupId(TdmDealerGroups.findGroupIds(new Set<Id>{ dealer.Id }), dealer.Id, TdmDealerGroups.Tier.STAFF);
        System.assertEquals(1, [SELECT COUNT() FROM GroupMember WHERE GroupId = :staff AND UserOrGroupId = :rep.Id]);
        System.assertEquals(1, [SELECT COUNT() FROM PermissionSetAssignment WHERE AssigneeId = :rep.Id AND PermissionSet.Name = 'TDM_Sales_Rep']);
    }

    @isTest
    static void onlyCompanyAdminCanGrantCompanyAdmin() {
        User dealerAdmin = staffUser('tdmdadm1', 'TDM_Dealer_Admin');

        Database.SaveResult result;
        System.runAs(dealerAdmin) {
            result = Database.insert(new Staff_Assignment__c(User__c = dealerAdmin.Id, Role__c = 'Company_Admin'), false);
        }

        System.assertEquals(false, result.isSuccess(), 'A dealer admin must not be able to escalate to Company Admin.');
        System.assert(result.getErrors()[0].getMessage().contains('Company Admin'));
    }

    @isTest
    static void recalcBatchRestoresMissingShares() {
        Dealership__c dealer = dealership('tdm-share-recalc');
        Map<String, Id> groupIds = provisionGroups(new Set<Id>{ dealer.Id });
        delete [SELECT Id FROM Dealership__Share WHERE ParentId = :dealer.Id AND RowCause = :TdmRecordSharing.ROW_CAUSE];

        Test.startTest();
        TdmSharingRecalcBatch.runFor(new Set<Id>{ dealer.Id });
        Test.stopTest();

        Map<Id, String> shares = sharesOf('Dealership__Share', dealer.Id);
        System.assertEquals('Read', shares.get(groupOf(groupIds, dealer.Id, TdmDealerGroups.Tier.STAFF)));
        System.assertEquals('Edit', shares.get(groupOf(groupIds, dealer.Id, TdmDealerGroups.Tier.ADMINS)));
    }
}
