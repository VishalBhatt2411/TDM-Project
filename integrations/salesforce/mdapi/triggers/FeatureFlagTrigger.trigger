trigger FeatureFlagTrigger on Feature_Flag__c (before insert, before update) {
    TdmScopeKeys.applyFeatureFlagKeys(Trigger.new);
}
