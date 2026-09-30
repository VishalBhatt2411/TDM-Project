trigger BranchTrigger on Branch__c (after insert, after update, after undelete) {
    Set<Id> ids = TdmRecordSharing.changed(Trigger.new, Trigger.isUpdate ? Trigger.oldMap : null, new List<String>{ 'Dealership__c' });
    if (ids.isEmpty()) {
        return;
    }
    TdmRecordSharing.apply('Branch__c', ids);
    if (Trigger.isUpdate) {
        Map<Id, Vehicle_Allocation__c> allocations = new Map<Id, Vehicle_Allocation__c>(
            [SELECT Id FROM Vehicle_Allocation__c WHERE From_Branch__c IN :ids OR To_Branch__c IN :ids]
        );
        TdmRecordSharing.apply('Vehicle_Allocation__c', allocations.keySet());
    }
}
