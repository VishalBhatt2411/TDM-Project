/**
 * Apex managed sharing that scopes TDM records to their dealership (row cause TDM_Dealership__c).
 * Every dealership-owned object is Private; this class grants each tier group of the record's
 * dealership (see TdmDealerGroups) the access its role needs, plus a few per-user grants (a
 * drive's owner on its compliance/feedback records, a staff member on their own assignment).
 *
 * apply() is idempotent: it recomputes the desired grants for the given records, diffs them
 * against the existing TDM_Dealership__c shares and writes only the difference, so triggers,
 * TdmSharingRecalcBatch and re-runs all converge on the same state.
 */
public without sharing class TdmRecordSharing {
    public static final String ROW_CAUSE = 'TDM_Dealership__c';
    private static final String READ = 'Read';
    private static final String EDIT = 'Edit';

    private class GroupGrant {
        final String dealershipPath;
        final TdmDealerGroups.Tier tier;
        final String accessLevel;
        GroupGrant(String dealershipPath, TdmDealerGroups.Tier tier, String accessLevel) {
            this.dealershipPath = dealershipPath;
            this.tier = tier;
            this.accessLevel = accessLevel;
        }
    }

    private class UserGrant {
        final String userPath;
        final String accessLevel;
        UserGrant(String userPath, String accessLevel) {
            this.userPath = userPath;
            this.accessLevel = accessLevel;
        }
    }

    private class Rule {
        final String shareObject;
        final List<GroupGrant> groupGrants = new List<GroupGrant>();
        final List<UserGrant> userGrants = new List<UserGrant>();
        Rule(String shareObject) {
            this.shareObject = shareObject;
        }
        Rule grant(String dealershipPath, TdmDealerGroups.Tier tier, String accessLevel) {
            groupGrants.add(new GroupGrant(dealershipPath, tier, accessLevel));
            return this;
        }
        Rule grantUser(String userPath, String accessLevel) {
            userGrants.add(new UserGrant(userPath, accessLevel));
            return this;
        }
        /** Every relationship path that resolves to the record's dealership(s). */
        Set<String> dealershipPaths() {
            Set<String> paths = new Set<String>();
            for (GroupGrant g : groupGrants) {
                paths.add(g.dealershipPath);
            }
            return paths;
        }
    }

    private static final Map<String, Rule> RULES = new Map<String, Rule>{
        'Dealership__c' => new Rule('Dealership__Share')
            .grant('Id', TdmDealerGroups.Tier.STAFF, READ)
            .grant('Id', TdmDealerGroups.Tier.ADMINS, EDIT),
        'Branch__c' => new Rule('Branch__Share')
            .grant('Dealership__c', TdmDealerGroups.Tier.STAFF, READ)
            .grant('Dealership__c', TdmDealerGroups.Tier.ADMINS, EDIT),
        'Vehicle__c' => new Rule('Vehicle__Share')
            .grant('Dealership__c', TdmDealerGroups.Tier.STAFF, READ)
            .grant('Dealership__c', TdmDealerGroups.Tier.MANAGERS, EDIT),
        // A rep reaches their own drives through ownership; managers see every drive of their dealership.
        'Booking__c' => new Rule('Booking__Share')
            .grant('Dealership__c', TdmDealerGroups.Tier.MANAGERS, EDIT),
        'Staff_Assignment__c' => new Rule('Staff_Assignment__Share')
            .grant('Dealership__c', TdmDealerGroups.Tier.MANAGERS, READ)
            .grant('Dealership__c', TdmDealerGroups.Tier.ADMINS, EDIT)
            .grantUser('User__c', READ),
        'Compliance_Record__c' => new Rule('Compliance_Record__Share')
            .grant('Booking__r.Dealership__c', TdmDealerGroups.Tier.MANAGERS, EDIT)
            .grantUser('Booking__r.OwnerId', EDIT),
        'Drive_Feedback__c' => new Rule('Drive_Feedback__Share')
            .grant('Booking__r.Dealership__c', TdmDealerGroups.Tier.MANAGERS, EDIT)
            .grantUser('Booking__r.OwnerId', EDIT),
        // A transfer concerns both dealerships involved.
        'Vehicle_Allocation__c' => new Rule('Vehicle_Allocation__Share')
            .grant('From_Branch__r.Dealership__c', TdmDealerGroups.Tier.MANAGERS, EDIT)
            .grant('To_Branch__r.Dealership__c', TdmDealerGroups.Tier.MANAGERS, EDIT)
    };

    /** The objects this class shares, in the order a full recalculation processes them. */
    public static List<String> sharedObjects() {
        return new List<String>{
            'Dealership__c', 'Branch__c', 'Vehicle__c', 'Booking__c', 'Staff_Assignment__c',
            'Compliance_Record__c', 'Drive_Feedback__c', 'Vehicle_Allocation__c'
        };
    }

    /** SOQL condition selecting an object's records that belong to any of :dealershipIds. */
    public static String dealershipFilter(String objectName) {
        List<String> clauses = new List<String>();
        for (String path : ruleFor(objectName).dealershipPaths()) {
            clauses.add(path + ' IN :dealershipIds');
        }
        return '(' + String.join(clauses, ' OR ') + ')';
    }

    public static void apply(String objectName, Set<Id> recordIds) {
        if (recordIds == null || recordIds.isEmpty()) {
            return;
        }
        Rule rule = ruleFor(objectName);

        Set<String> fields = new Set<String>{ 'Id', 'OwnerId' };
        fields.addAll(rule.dealershipPaths());
        for (UserGrant g : rule.userGrants) {
            fields.add(g.userPath);
        }
        List<SObject> records = Database.query(
            'SELECT ' + String.join(new List<String>(fields), ', ') + ' FROM ' + objectName + ' WHERE Id IN :recordIds'
        );

        Set<Id> dealershipIds = new Set<Id>();
        for (SObject record : records) {
            for (String path : rule.dealershipPaths()) {
                Id dealershipId = (Id) read(record, path);
                if (dealershipId != null) {
                    dealershipIds.add(dealershipId);
                }
            }
        }
        Map<String, Id> groupIds = TdmDealerGroups.findGroupIds(dealershipIds);

        // parentId:userOrGroupId -> strongest access level wanted.
        Map<String, String> desired = new Map<String, String>();
        for (SObject record : records) {
            Id ownerId = (Id) record.get('OwnerId');
            for (GroupGrant g : rule.groupGrants) {
                Id dealershipId = (Id) read(record, g.dealershipPath);
                Id groupId = dealershipId == null ? null : TdmDealerGroups.groupId(groupIds, dealershipId, g.tier);
                want(desired, record.Id, groupId, g.accessLevel);
            }
            for (UserGrant g : rule.userGrants) {
                Id userId = (Id) read(record, g.userPath);
                // The owner already has full access; a share to them is rejected by the platform.
                if (userId != ownerId) {
                    want(desired, record.Id, userId, g.accessLevel);
                }
            }
        }

        String rowCause = ROW_CAUSE;
        List<SObject> toDelete = new List<SObject>();
        for (SObject share : Database.query(
            'SELECT Id, ParentId, UserOrGroupId, AccessLevel FROM ' + rule.shareObject
                + ' WHERE ParentId IN :recordIds AND RowCause = :rowCause'
        )) {
            String key = key((Id) share.get('ParentId'), (Id) share.get('UserOrGroupId'));
            if (desired.get(key) == (String) share.get('AccessLevel')) {
                desired.remove(key);
            } else {
                toDelete.add(share);
            }
        }

        List<SObject> toInsert = new List<SObject>();
        Type shareType = Type.forName(rule.shareObject);
        for (String key : desired.keySet()) {
            List<String> parts = key.split(':');
            SObject share = (SObject) shareType.newInstance();
            share.put('ParentId', parts[0]);
            share.put('UserOrGroupId', parts[1]);
            share.put('AccessLevel', desired.get(key));
            share.put('RowCause', ROW_CAUSE);
            toInsert.add(share);
        }

        delete toDelete;
        List<String> failures = new List<String>();
        List<Database.SaveResult> results = Database.insert(toInsert, false);
        for (Integer i = 0; i < results.size(); i++) {
            for (Database.Error error : results[i].getErrors()) {
                if (!isBenign(error)) {
                    failures.add(toInsert[i].get('ParentId') + ': ' + error.getMessage());
                }
            }
        }
        if (!failures.isEmpty()) {
            throw new SharingException('TDM dealership sharing failed on ' + objectName + ' — ' + String.join(failures, '; '));
        }
    }

    /** Ids of records whose value changed on any of the given fields (all records on insert/delete/undelete). */
    public static Set<Id> changed(List<SObject> records, Map<Id, SObject> oldMap, List<String> fields) {
        Set<Id> ids = new Set<Id>();
        for (SObject record : records) {
            SObject old = oldMap == null ? null : oldMap.get(record.Id);
            if (old == null) {
                ids.add(record.Id);
                continue;
            }
            for (String field : fields) {
                if (record.get(field) != old.get(field)) {
                    ids.add(record.Id);
                    break;
                }
            }
        }
        return ids;
    }

    /**
     * Two rejections leave nothing to fix: a deactivated user keeps their assignment/drives for
     * history but can't be shared to, and an AccessLevel rejection ("trivial share level") means the
     * org-wide default already grants that access — e.g. an org still being moved to Private OWD.
     */
    private static Boolean isBenign(Database.Error error) {
        return error.getStatusCode() == StatusCode.INACTIVE_OWNER_OR_USER
            || (error.getStatusCode() == StatusCode.FIELD_INTEGRITY_EXCEPTION && error.getFields().contains('AccessLevel'));
    }

    private static void want(Map<String, String> desired, Id parentId, Id userOrGroupId, String accessLevel) {
        if (userOrGroupId == null) {
            return;
        }
        String key = key(parentId, userOrGroupId);
        if (desired.get(key) != EDIT) {
            desired.put(key, accessLevel);
        }
    }

    private static String key(Id parentId, Id userOrGroupId) {
        return String.valueOf(parentId) + ':' + String.valueOf(userOrGroupId);
    }

    private static Object read(SObject record, String path) {
        List<String> parts = path.split('\\.');
        SObject current = record;
        for (Integer i = 0; i < parts.size() - 1; i++) {
            current = current.getSObject(parts[i]);
            if (current == null) {
                return null;
            }
        }
        return current.get(parts[parts.size() - 1]);
    }

    private static Rule ruleFor(String objectName) {
        Rule rule = RULES.get(objectName);
        if (rule == null) {
            throw new SharingException('No TDM dealership sharing rule for ' + objectName);
        }
        return rule;
    }

    public class SharingException extends Exception {}
}
