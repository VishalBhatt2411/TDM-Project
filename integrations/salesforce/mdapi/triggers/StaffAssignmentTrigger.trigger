trigger StaffAssignmentTrigger on Staff_Assignment__c (before insert, before update, after insert, after update, after delete, after undelete) {
    if (Trigger.isBefore) {
        TdmScopeKeys.applyStaffAssignmentKeys(Trigger.new);
        TdmStaffAccessSync.guardCompanyAdmin(Trigger.new, Trigger.oldMap);
        return;
    }
    List<String> accessFields = new List<String>{ 'User__c', 'Role__c', 'Dealership__c', 'Is_Active__c' };
    List<Staff_Assignment__c> current = Trigger.isDelete ? Trigger.old : Trigger.new;
    Set<Id> changedIds = TdmRecordSharing.changed(current, Trigger.isUpdate ? Trigger.oldMap : null, accessFields);
    if (changedIds.isEmpty()) {
        return;
    }
    if (!Trigger.isDelete) {
        TdmRecordSharing.apply('Staff_Assignment__c', changedIds);
    }
    // Both the old and the new user: re-pointing an assignment moves access from one to the other.
    Set<Id> userIds = new Set<Id>();
    for (Id recordId : changedIds) {
        userIds.add(Trigger.isDelete ? Trigger.oldMap.get(recordId).User__c : Trigger.newMap.get(recordId).User__c);
        if (Trigger.isUpdate) {
            userIds.add(Trigger.oldMap.get(recordId).User__c);
        }
    }
    TdmStaffAccessSync.enqueue(userIds);
}
