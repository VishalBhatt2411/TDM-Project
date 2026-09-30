trigger BookingTrigger on Booking__c (before insert, before update, after insert, after update, after undelete) {
    if (Trigger.isBefore) {
        TdmDealershipDefaults.applyBookingDefaults(Trigger.new);
        return;
    }
    Map<Id, SObject> oldMap = Trigger.isUpdate ? Trigger.oldMap : null;
    TdmRecordSharing.apply('Booking__c', TdmRecordSharing.changed(Trigger.new, oldMap, new List<String>{ 'Dealership__c' }));
    if (Trigger.isUpdate) {
        // A drive's compliance and feedback records follow its dealership and its assigned rep.
        Set<Id> moved = TdmRecordSharing.changed(Trigger.new, oldMap, new List<String>{ 'Dealership__c', 'OwnerId' });
        if (!moved.isEmpty()) {
            TdmRecordSharing.apply('Compliance_Record__c', new Map<Id, Compliance_Record__c>(
                [SELECT Id FROM Compliance_Record__c WHERE Booking__c IN :moved]
            ).keySet());
            TdmRecordSharing.apply('Drive_Feedback__c', new Map<Id, Drive_Feedback__c>(
                [SELECT Id FROM Drive_Feedback__c WHERE Booking__c IN :moved]
            ).keySet());
        }
    }
}
