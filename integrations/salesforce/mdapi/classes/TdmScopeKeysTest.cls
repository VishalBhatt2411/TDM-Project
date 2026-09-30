@isTest
private class TdmScopeKeysTest {

    private static Dealership__c dealership(String slug) {
        Dealership__c record = new Dealership__c(Name = 'Dealer ' + slug, Url_Slug__c = slug);
        insert record;
        return record;
    }

    private static Branch__c branch(Dealership__c owner) {
        Branch__c record = new Branch__c(Name = 'Main', Dealership__c = owner.Id);
        insert record;
        return record;
    }

    @isTest
    static void companyAdminKeyUsesCompanyScope() {
        Staff_Assignment__c record = new Staff_Assignment__c(User__c = UserInfo.getUserId(), Role__c = 'Company_Admin');
        insert record;

        record = [SELECT User_Dealership_Key__c FROM Staff_Assignment__c WHERE Id = :record.Id];
        System.assertEquals(String.valueOf(UserInfo.getUserId()) + ':' + TdmScopeKeys.COMPANY_SCOPE, record.User_Dealership_Key__c);
    }

    @isTest
    static void rejectsSecondAssignmentForSameUserAndDealership() {
        Dealership__c dealer = dealership('tdm-test-one');
        insert new Staff_Assignment__c(User__c = UserInfo.getUserId(), Role__c = 'Dealer_Admin', Dealership__c = dealer.Id);

        try {
            insert new Staff_Assignment__c(User__c = UserInfo.getUserId(), Role__c = 'Manager', Dealership__c = dealer.Id);
            System.assert(false, 'Expected a duplicate assignment to be rejected.');
        } catch (DmlException e) {
            System.assertEquals(StatusCode.DUPLICATE_VALUE, e.getDmlType(0));
        }
    }

    @isTest
    static void keyFollowsDealershipChange() {
        Dealership__c first = dealership('tdm-test-first');
        Dealership__c second = dealership('tdm-test-second');
        Staff_Assignment__c record = new Staff_Assignment__c(User__c = UserInfo.getUserId(), Role__c = 'Manager', Dealership__c = first.Id);
        insert record;

        record.Dealership__c = second.Id;
        update record;

        record = [SELECT User_Dealership_Key__c FROM Staff_Assignment__c WHERE Id = :record.Id];
        System.assertEquals(String.valueOf(UserInfo.getUserId()) + ':' + String.valueOf(second.Id), record.User_Dealership_Key__c);
    }

    @isTest
    static void rejectsBranchFromAnotherDealership() {
        Dealership__c home = dealership('tdm-test-home');
        Branch__c foreignBranch = branch(dealership('tdm-test-away'));

        Database.SaveResult result = Database.insert(
            new Staff_Assignment__c(User__c = UserInfo.getUserId(), Role__c = 'Sales_Rep', Dealership__c = home.Id, Branch__c = foreignBranch.Id),
            false
        );
        System.assertEquals(false, result.isSuccess());
    }

    @isTest
    static void featureFlagKeysAreScopedAndUnique() {
        Dealership__c dealer = dealership('tdm-test-flags');
        Branch__c site = branch(dealer);
        Feature_Flag__c company = new Feature_Flag__c(Key__c = 'qr_check_in', Enabled__c = true);
        Feature_Flag__c branchLevel = new Feature_Flag__c(Key__c = 'qr_check_in', Dealership__c = dealer.Id, Branch__c = site.Id);
        insert new List<Feature_Flag__c>{ company, branchLevel };

        Map<Id, Feature_Flag__c> saved = new Map<Id, Feature_Flag__c>([SELECT Scope_Key__c FROM Feature_Flag__c]);
        System.assertEquals('qr_check_in:COMPANY:ALL', saved.get(company.Id).Scope_Key__c);
        System.assertEquals('qr_check_in:' + String.valueOf(dealer.Id) + ':' + String.valueOf(site.Id), saved.get(branchLevel.Id).Scope_Key__c);

        Database.SaveResult duplicate = Database.insert(new Feature_Flag__c(Key__c = 'qr_check_in'), false);
        System.assertEquals(false, duplicate.isSuccess());
    }

    @isTest
    static void notificationTemplateKeysAreScoped() {
        Dealership__c dealer = dealership('tdm-test-templates');
        Notification_Template__c record = new Notification_Template__c(Key__c = 'bookingConfirmation', Dealership__c = dealer.Id, Subject__c = 'See you soon');
        insert record;

        record = [SELECT Scope_Key__c FROM Notification_Template__c WHERE Id = :record.Id];
        System.assertEquals('bookingConfirmation:' + String.valueOf(dealer.Id), record.Scope_Key__c);
    }
}
