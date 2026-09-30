trigger DriveFeedbackTrigger on Drive_Feedback__c (after insert, after update, after undelete) {
    TdmRecordSharing.apply(
        'Drive_Feedback__c',
        TdmRecordSharing.changed(Trigger.new, Trigger.isUpdate ? Trigger.oldMap : null, new List<String>{ 'Booking__c' })
    );
}
