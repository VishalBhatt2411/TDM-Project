trigger VehicleTrigger on Vehicle__c (before insert, before update, after insert, after update, after undelete) {
    if (Trigger.isBefore) {
        TdmDealershipDefaults.applyVehicleDefaults(Trigger.new);
        return;
    }
    TdmRecordSharing.apply(
        'Vehicle__c',
        TdmRecordSharing.changed(Trigger.new, Trigger.isUpdate ? Trigger.oldMap : null, new List<String>{ 'Dealership__c' })
    );
}
