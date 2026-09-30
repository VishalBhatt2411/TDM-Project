/**
 * Recomputes TDM dealership sharing (TdmRecordSharing) for every shared object, one object per
 * batch run, chaining to the next object in finish(). Used to backfill after the first deploy
 * and whenever a dealership's groups are created after its records already exist. With
 * dealershipIds set, only those dealerships' records are processed.
 */
public without sharing class TdmSharingRecalcBatch implements Database.Batchable<SObject> {
    private static final Integer BATCH_SIZE = 200;

    private final List<String> objectQueue;
    private final Set<Id> dealershipIds;

    private TdmSharingRecalcBatch(List<String> objectQueue, Set<Id> dealershipIds) {
        this.objectQueue = objectQueue;
        this.dealershipIds = dealershipIds == null ? null : dealershipIds.clone();
    }

    /** Full backfill of every dealership's records. */
    public static Id runAll() {
        return Database.executeBatch(new TdmSharingRecalcBatch(TdmRecordSharing.sharedObjects(), null), BATCH_SIZE);
    }

    public static Id runFor(Set<Id> dealershipIds) {
        return Database.executeBatch(new TdmSharingRecalcBatch(TdmRecordSharing.sharedObjects(), dealershipIds), BATCH_SIZE);
    }

    public Database.QueryLocator start(Database.BatchableContext context) {
        Set<Id> dealershipIds = this.dealershipIds;
        String objectName = objectQueue[0];
        String soql = 'SELECT Id FROM ' + objectName;
        if (dealershipIds != null) {
            soql += ' WHERE ' + TdmRecordSharing.dealershipFilter(objectName);
        }
        return Database.getQueryLocator(soql);
    }

    public void execute(Database.BatchableContext context, List<SObject> scope) {
        TdmRecordSharing.apply(objectQueue[0], new Map<Id, SObject>(scope).keySet());
    }

    public void finish(Database.BatchableContext context) {
        if (objectQueue.size() > 1) {
            List<String> remaining = objectQueue.clone();
            remaining.remove(0);
            Database.executeBatch(new TdmSharingRecalcBatch(remaining, dealershipIds), BATCH_SIZE);
        }
    }
}
