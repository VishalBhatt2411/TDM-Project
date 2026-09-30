trigger ComplianceRecordTrigger on Compliance_Record__c (after insert, after update, after undelete) {
    TdmRecordSharing.apply(
        'Compliance_Record__c',
        TdmRecordSharing.changed(Trigger.new, Trigger.isUpdate ? Trigger.oldMap : null, new List<String>{ 'Booking__c' })
    );
}
