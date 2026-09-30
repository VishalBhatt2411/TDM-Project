/**
 * Fills a blank Dealership__c from the record's branch (or, for a booking, its vehicle) before
 * save, so callers that only know the branch/vehicle — the customer booking flow — still produce
 * a dealership-scoped record. The Dealership_Required validation rules then reject anything that
 * still has none, and Branch_Belongs_To_Dealership rejects a mismatch.
 */
public without sharing class TdmDealershipDefaults {
    public static void applyVehicleDefaults(List<Vehicle__c> records) {
        Map<Id, Branch__c> branches = branchesOf(records);
        for (Vehicle__c record : records) {
            if (record.Dealership__c == null && branches.containsKey(record.Branch__c)) {
                record.Dealership__c = branches.get(record.Branch__c).Dealership__c;
            }
        }
    }

    public static void applyBookingDefaults(List<Booking__c> records) {
        Map<Id, Branch__c> branches = branchesOf(records);
        Set<Id> vehicleIds = new Set<Id>();
        for (Booking__c record : records) {
            if (record.Dealership__c == null && record.Vehicle__c != null) {
                vehicleIds.add(record.Vehicle__c);
            }
        }
        Map<Id, Vehicle__c> vehicles = vehicleIds.isEmpty()
            ? new Map<Id, Vehicle__c>()
            : new Map<Id, Vehicle__c>([SELECT Id, Dealership__c FROM Vehicle__c WHERE Id IN :vehicleIds]);
        for (Booking__c record : records) {
            if (record.Dealership__c != null) {
                continue;
            }
            if (branches.containsKey(record.Branch__c)) {
                record.Dealership__c = branches.get(record.Branch__c).Dealership__c;
            } else if (vehicles.containsKey(record.Vehicle__c)) {
                record.Dealership__c = vehicles.get(record.Vehicle__c).Dealership__c;
            }
        }
    }

    private static Map<Id, Branch__c> branchesOf(List<SObject> records) {
        Set<Id> branchIds = new Set<Id>();
        for (SObject record : records) {
            Id branchId = (Id) record.get('Branch__c');
            if (record.get('Dealership__c') == null && branchId != null) {
                branchIds.add(branchId);
            }
        }
        return branchIds.isEmpty()
            ? new Map<Id, Branch__c>()
            : new Map<Id, Branch__c>([SELECT Id, Dealership__c FROM Branch__c WHERE Id IN :branchIds]);
    }
}
