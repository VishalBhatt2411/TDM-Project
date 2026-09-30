/**
 * Maintains the composite uniqueness keys on TDM's scoped records. Salesforce has no
 * multi-column unique index, so each object carries a unique text key derived from the
 * columns that must be unique together; these before-save hooks recompute it on every
 * insert/update so it can never drift from the record it describes.
 */
public with sharing class TdmScopeKeys {
    @TestVisible static final String COMPANY_SCOPE = 'COMPANY';
    @TestVisible static final String ALL_BRANCHES = 'ALL';

    public static void applyStaffAssignmentKeys(List<Staff_Assignment__c> records) {
        for (Staff_Assignment__c record : records) {
            record.User_Dealership_Key__c = record.User__c == null
                ? null
                : join(new List<String>{ String.valueOf(record.User__c), scope(record.Dealership__c, COMPANY_SCOPE) });
        }
    }

    public static void applyFeatureFlagKeys(List<Feature_Flag__c> records) {
        for (Feature_Flag__c record : records) {
            record.Scope_Key__c = String.isBlank(record.Key__c)
                ? null
                : join(new List<String>{ record.Key__c, scope(record.Dealership__c, COMPANY_SCOPE), scope(record.Branch__c, ALL_BRANCHES) });
        }
    }

    public static void applyNotificationTemplateKeys(List<Notification_Template__c> records) {
        for (Notification_Template__c record : records) {
            record.Scope_Key__c = String.isBlank(record.Key__c)
                ? null
                : join(new List<String>{ record.Key__c, scope(record.Dealership__c, COMPANY_SCOPE) });
        }
    }

    private static String join(List<String> parts) {
        return String.join(parts, ':');
    }

    private static String scope(Id recordId, String fallback) {
        return recordId == null ? fallback : String.valueOf(recordId);
    }
}
