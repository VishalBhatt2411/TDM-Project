trigger VehicleAllocationTrigger on Vehicle_Allocation__c (after insert, after update, after undelete) {
    TdmRecordSharing.apply(
        'Vehicle_Allocation__c',
        TdmRecordSharing.changed(Trigger.new, Trigger.isUpdate ? Trigger.oldMap : null, new List<String>{ 'From_Branch__c', 'To_Branch__c' })
    );
}
