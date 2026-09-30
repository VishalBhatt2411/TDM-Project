/**
 * Provisions a dealership's tier groups (TdmDealerGroups) after it is created or renamed. Groups
 * are setup objects, so this runs async rather than in the Dealership__c trigger's transaction.
 * Records saved before the groups existed got no group shares, so a recalculation follows for
 * any dealership whose groups were just created.
 */
public without sharing class TdmDealerSetupJob implements Queueable {
    private final Set<Id> dealershipIds;

    public TdmDealerSetupJob(Set<Id> dealershipIds) {
        this.dealershipIds = dealershipIds.clone();
    }

    public void execute(QueueableContext context) {
        Set<Id> created = TdmDealerGroups.ensure(dealershipIds);
        if (!created.isEmpty()) {
            TdmSharingRecalcBatch.runFor(created);
        }
    }
}
