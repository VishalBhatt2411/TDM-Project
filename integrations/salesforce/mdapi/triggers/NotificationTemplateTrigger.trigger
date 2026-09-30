trigger NotificationTemplateTrigger on Notification_Template__c (before insert, before update) {
    TdmScopeKeys.applyNotificationTemplateKeys(Trigger.new);
}
