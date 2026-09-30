/**
 * Three public groups per dealership, nested so a user only sits in the group for their own
 * role: Admins is a member of Managers, Managers is a member of Staff. TdmRecordSharing grants
 * each tier its access to the dealership's records; TdmStaffAccessSync keeps user membership in
 * line with Staff_Assignment__c. Groups are setup objects, so they are only ever written from an
 * async context (TdmDealerSetupJob, TdmStaffAccessSync), never alongside business-record DML.
 */
public without sharing class TdmDealerGroups {
    public enum Tier { STAFF, MANAGERS, ADMINS }

    private static final String PREFIX = 'TDM_';
    private static final Map<Tier, String> SUFFIX = new Map<Tier, String>{
        Tier.STAFF => '_Staff',
        Tier.MANAGERS => '_Mgmt',
        Tier.ADMINS => '_Admin'
    };
    private static final Map<Tier, String> LABEL = new Map<Tier, String>{
        Tier.STAFF => 'Staff',
        Tier.MANAGERS => 'Managers',
        Tier.ADMINS => 'Admins'
    };
    /** Only groups this class created are ever touched: the 18-character dealership id makes the name unambiguous. */
    private static final Pattern DEALER_GROUP = Pattern.compile('^TDM_[a-zA-Z0-9]{18}_(Staff|Mgmt|Admin)$');
    private static final Integer MAX_DEALERSHIP_LABEL = 26;

    /** The 18-character id is case-safe; developer names are compared case-insensitively. */
    public static String developerName(Id dealershipId, Tier tier) {
        return PREFIX + String.valueOf(dealershipId) + SUFFIX.get(tier);
    }

    public static Boolean isDealerGroup(String developerName) {
        return developerName != null && DEALER_GROUP.matcher(developerName).matches();
    }

    /** Existing groups for these dealerships, keyed by lower-cased developer name. Missing groups are simply absent. */
    public static Map<String, Id> findGroupIds(Set<Id> dealershipIds) {
        Map<String, Id> ids = new Map<String, Id>();
        for (Group g : queryGroups(dealershipIds)) {
            ids.put(g.DeveloperName.toLowerCase(), g.Id);
        }
        return ids;
    }

    public static Id groupId(Map<String, Id> groupIds, Id dealershipId, Tier tier) {
        return groupIds.get(developerName(dealershipId, tier).toLowerCase());
    }

    /**
     * Creates any missing groups, nests them, and refreshes their labels after a dealership is
     * renamed. Returns the dealerships that got at least one new group, whose existing records
     * therefore still need sharing (see TdmSharingRecalcBatch).
     */
    public static Set<Id> ensure(Set<Id> dealershipIds) {
        Set<Id> created = new Set<Id>();
        if (dealershipIds == null || dealershipIds.isEmpty()) {
            return created;
        }
        Map<String, Group> existing = new Map<String, Group>();
        for (Group g : queryGroups(dealershipIds)) {
            existing.put(g.DeveloperName.toLowerCase(), g);
        }

        List<Group> toInsert = new List<Group>();
        List<Group> toUpdate = new List<Group>();
        for (Dealership__c dealership : [SELECT Id, Name FROM Dealership__c WHERE Id IN :dealershipIds]) {
            for (Tier tier : Tier.values()) {
                String name = developerName(dealership.Id, tier);
                String label = label(dealership.Name, tier);
                Group current = existing.get(name.toLowerCase());
                if (current == null) {
                    // Hierarchy-based access would let a user's role-hierarchy managers bypass dealership isolation.
                    toInsert.add(new Group(Name = label, DeveloperName = name, Type = 'Regular', DoesIncludeBosses = false));
                    created.add(dealership.Id);
                } else if (current.Name != label) {
                    current.Name = label;
                    toUpdate.add(current);
                }
            }
        }
        // A concurrent job (setup vs. staff sync) may create the same group first; theirs is as good as ours.
        List<Database.SaveResult> results = Database.insert(toInsert, false);
        for (Integer i = 0; i < results.size(); i++) {
            if (!results[i].isSuccess()) {
                throwUnlessDuplicate(results[i].getErrors(), toInsert[i].DeveloperName);
            }
        }
        update toUpdate;
        nest(dealershipIds);
        return created;
    }

    private static void nest(Set<Id> dealershipIds) {
        Map<String, Id> groupIds = findGroupIds(dealershipIds);
        Set<String> present = new Set<String>();
        for (GroupMember member : [SELECT GroupId, UserOrGroupId FROM GroupMember WHERE GroupId IN :groupIds.values()]) {
            present.add(member.GroupId + ':' + member.UserOrGroupId);
        }
        List<GroupMember> toInsert = new List<GroupMember>();
        for (Id dealershipId : dealershipIds) {
            addNesting(toInsert, present, groupId(groupIds, dealershipId, Tier.STAFF), groupId(groupIds, dealershipId, Tier.MANAGERS));
            addNesting(toInsert, present, groupId(groupIds, dealershipId, Tier.MANAGERS), groupId(groupIds, dealershipId, Tier.ADMINS));
        }
        List<Database.SaveResult> results = Database.insert(toInsert, false);
        for (Integer i = 0; i < results.size(); i++) {
            if (!results[i].isSuccess()) {
                throwUnlessDuplicate(results[i].getErrors(), String.valueOf(toInsert[i].GroupId));
            }
        }
    }

    private static void throwUnlessDuplicate(List<Database.Error> errors, String subject) {
        for (Database.Error error : errors) {
            if (error.getStatusCode() != StatusCode.DUPLICATE_DEVELOPER_NAME && error.getStatusCode() != StatusCode.DUPLICATE_VALUE) {
                throw new GroupException('TDM dealer group setup failed for ' + subject + ': ' + error.getMessage());
            }
        }
    }

    public class GroupException extends Exception {}

    private static void addNesting(List<GroupMember> toInsert, Set<String> present, Id parentId, Id childId) {
        if (parentId != null && childId != null && !present.contains(parentId + ':' + childId)) {
            toInsert.add(new GroupMember(GroupId = parentId, UserOrGroupId = childId));
        }
    }

    private static List<Group> queryGroups(Set<Id> dealershipIds) {
        Set<String> names = new Set<String>();
        for (Id dealershipId : dealershipIds) {
            for (Tier tier : Tier.values()) {
                names.add(developerName(dealershipId, tier));
            }
        }
        return [SELECT Id, DeveloperName, Name FROM Group WHERE Type = 'Regular' AND DeveloperName IN :names];
    }

    private static String label(String dealershipName, Tier tier) {
        return 'TDM ' + dealershipName.left(MAX_DEALERSHIP_LABEL) + ' ' + LABEL.get(tier);
    }
}
