trigger DealershipTrigger on Dealership__c (after insert, after update, after undelete) {
    // Groups carry the dealership's name, so a rename relabels them; creation provisions them.
    Set<Id> ids = TdmRecordSharing.changed(Trigger.new, Trigger.isUpdate ? Trigger.oldMap : null, new List<String>{ 'Name' });
    if (!ids.isEmpty()) {
        System.enqueueJob(new TdmDealerSetupJob(ids));
    }
    if (!Trigger.isUpdate) {
        TdmRecordSharing.apply('Dealership__c', Trigger.newMap.keySet());
    }
}
