/**
 * Derives each staff user's Salesforce access from their active Staff_Assignment__c records:
 * membership of their dealerships' tier groups (TdmDealerGroups) and the TDM permission set for
 * their role. Only TDM dealer groups and TDM permission sets are ever added or removed, so access
 * granted by an admin outside TDM is left alone. GroupMember and PermissionSetAssignment are
 * setup objects, so the sync runs async (enqueue()) rather than in the assignment's transaction.
 */
public without sharing class TdmStaffAccessSync implements Queueable {
    public static final String COMPANY_ADMIN = 'Company_Admin';

    private static final Map<String, TdmDealerGroups.Tier> ROLE_TIER = new Map<String, TdmDealerGroups.Tier>{
        'Sales_Rep' => TdmDealerGroups.Tier.STAFF,
        'Manager' => TdmDealerGroups.Tier.MANAGERS,
        'Dealer_Admin' => TdmDealerGroups.Tier.ADMINS
    };
    private static final Map<String, String> ROLE_PERMISSION_SET = new Map<String, String>{
        COMPANY_ADMIN => 'TDM_Full_Access',
        'Dealer_Admin' => 'TDM_Dealer_Admin',
        'Manager' => 'TDM_Manager',
        'Sales_Rep' => 'TDM_Sales_Rep'
    };

    private final Set<Id> userIds;

    public TdmStaffAccessSync(Set<Id> userIds) {
        this.userIds = userIds.clone();
    }

    public static void enqueue(Set<Id> userIds) {
        Set<Id> ids = userIds.clone();
        ids.remove(null);
        if (!ids.isEmpty()) {
            System.enqueueJob(new TdmStaffAccessSync(ids));
        }
    }

    /**
     * Company Admin grants TDM_Full_Access across every dealership, so only someone who already
     * holds that level (or Modify All Data) may create, re-point or demote one. Dealer admins can
     * otherwise edit the assignments of their own dealership.
     */
    public static void guardCompanyAdmin(List<Staff_Assignment__c> records, Map<Id, Staff_Assignment__c> oldMap) {
        List<Staff_Assignment__c> touching = new List<Staff_Assignment__c>();
        for (Staff_Assignment__c record : records) {
            Staff_Assignment__c old = oldMap == null ? null : oldMap.get(record.Id);
            if (record.Role__c == COMPANY_ADMIN || (old != null && old.Role__c == COMPANY_ADMIN)) {
                touching.add(record);
            }
        }
        if (touching.isEmpty() || callerIsCompanyAdmin()) {
            return;
        }
        for (Staff_Assignment__c record : touching) {
            record.addError('Only a Company Admin can grant or change Company Admin access.');
        }
    }

    public void execute(QueueableContext context) {
        List<Staff_Assignment__c> assignments = [
            SELECT User__c, Role__c, Dealership__c FROM Staff_Assignment__c
            WHERE User__c IN :userIds AND Is_Active__c = true AND User__r.IsActive = true
        ];
        Set<Id> dealershipIds = new Set<Id>();
        for (Staff_Assignment__c assignment : assignments) {
            if (assignment.Dealership__c != null) {
                dealershipIds.add(assignment.Dealership__c);
            }
        }
        Set<Id> createdGroups = TdmDealerGroups.ensure(dealershipIds);
        Map<String, Id> groupIds = TdmDealerGroups.findGroupIds(dealershipIds);
        Map<String, Id> permissionSetIds = new Map<String, Id>();
        for (PermissionSet ps : [SELECT Id, Name FROM PermissionSet WHERE Name IN :ROLE_PERMISSION_SET.values()]) {
            permissionSetIds.put(ps.Name, ps.Id);
        }

        Set<String> wantedMembers = new Set<String>();
        Set<String> wantedPermissionSets = new Set<String>();
        for (Staff_Assignment__c assignment : assignments) {
            TdmDealerGroups.Tier tier = ROLE_TIER.get(assignment.Role__c);
            if (tier != null && assignment.Dealership__c != null) {
                Id groupId = TdmDealerGroups.groupId(groupIds, assignment.Dealership__c, tier);
                if (groupId != null) {
                    wantedMembers.add(pair(groupId, assignment.User__c));
                }
            }
            Id permissionSetId = permissionSetIds.get(ROLE_PERMISSION_SET.get(assignment.Role__c));
            if (permissionSetId != null) {
                wantedPermissionSets.add(pair(permissionSetId, assignment.User__c));
            }
        }

        List<GroupMember> staleMembers = new List<GroupMember>();
        for (GroupMember member : [
            SELECT Id, GroupId, UserOrGroupId, Group.DeveloperName FROM GroupMember
            WHERE UserOrGroupId IN :userIds AND Group.Type = 'Regular'
        ]) {
            if (TdmDealerGroups.isDealerGroup(member.Group.DeveloperName)
                    && !wantedMembers.remove(pair(member.GroupId, member.UserOrGroupId))) {
                staleMembers.add(member);
            }
        }
        List<PermissionSetAssignment> staleAssignments = new List<PermissionSetAssignment>();
        for (PermissionSetAssignment psa : [
            SELECT Id, PermissionSetId, AssigneeId FROM PermissionSetAssignment
            WHERE AssigneeId IN :userIds AND PermissionSetId IN :permissionSetIds.values()
        ]) {
            if (!wantedPermissionSets.remove(pair(psa.PermissionSetId, psa.AssigneeId))) {
                staleAssignments.add(psa);
            }
        }

        List<GroupMember> newMembers = new List<GroupMember>();
        for (String key : wantedMembers) {
            List<String> parts = key.split(':');
            newMembers.add(new GroupMember(GroupId = parts[0], UserOrGroupId = parts[1]));
        }
        List<PermissionSetAssignment> newAssignments = new List<PermissionSetAssignment>();
        for (String key : wantedPermissionSets) {
            List<String> parts = key.split(':');
            newAssignments.add(new PermissionSetAssignment(PermissionSetId = parts[0], AssigneeId = parts[1]));
        }

        delete staleMembers;
        delete staleAssignments;
        insert newMembers;
        insert newAssignments;

        if (!createdGroups.isEmpty()) {
            TdmSharingRecalcBatch.runFor(createdGroups);
        }
    }

    private static String pair(Id first, Id second) {
        return String.valueOf(first) + ':' + String.valueOf(second);
    }

    private static Boolean callerIsCompanyAdmin() {
        return [
            SELECT COUNT() FROM PermissionSetAssignment
            WHERE AssigneeId = :UserInfo.getUserId()
                AND (PermissionSet.Name = 'TDM_Full_Access' OR PermissionSet.PermissionsModifyAllData = true)
        ] > 0;
    }
}
