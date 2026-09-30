/**
 * DI tokens for the repository interfaces defined in @tdm/domain. Every domain
 * module injects against these tokens, never against a concrete adapter class —
 * this is the seam that lets Salesforce be swapped for another provider later.
 */
export const CUSTOMER_REPOSITORY = Symbol("CustomerRepository");
export const VEHICLE_REPOSITORY = Symbol("VehicleRepository");
export const BRANCH_REPOSITORY = Symbol("BranchRepository");
export const DEALERSHIP_REPOSITORY = Symbol("DealershipRepository");
export const BRANDING_REPOSITORY = Symbol("BrandingRepository");
export const BRAND_ASSET_REPOSITORY = Symbol("BrandAssetRepository");
export const REGIONAL_SETTINGS_REPOSITORY = Symbol("RegionalSettingsRepository");
export const BOOKING_SCHEDULE_REPOSITORY = Symbol("BookingScheduleRepository");
export const SALES_REP_REPOSITORY = Symbol("SalesRepRepository");
export const STAFF_ASSIGNMENT_REPOSITORY = Symbol("StaffAssignmentRepository");
/** Users of the business-data provider who can be given staff access — see StaffDirectory. */
export const STAFF_DIRECTORY = Symbol("StaffDirectory");
export const BOOKING_REPOSITORY = Symbol("BookingRepository");
export const WISHLIST_REPOSITORY = Symbol("WishlistRepository");
export const VEHICLE_ALLOCATION_REPOSITORY = Symbol("VehicleAllocationRepository");
export const SALES_OPPORTUNITY_REPOSITORY = Symbol("SalesOpportunityRepository");
export const AUTH_REPOSITORY = Symbol("AuthRepository");
export const AUDIT_LOG_REPOSITORY = Symbol("AuditLogRepository");
export const FEATURE_FLAG_REPOSITORY = Symbol("FeatureFlagRepository");
export const VEHICLE_VARIANT_REPOSITORY = Symbol("VehicleVariantRepository");
export const ANALYTICS_REPOSITORY = Symbol("AnalyticsRepository");
/** `(organizationId, purpose) => Promise<SalesforceIdentityProvider | null>` — built per tenant from its own Connected App. */
export const SALESFORCE_IDENTITY_PROVIDER_FACTORY = Symbol("SalesforceIdentityProviderFactory");
/** `{ name, ping() }` for the current tenant's business-data provider — see DataProviderHealth. */
export const DATA_PROVIDER_HEALTH = Symbol("DataProviderHealth");
/** `{ name, ping() }` for the platform's own store (tenants, sessions, audit) — gates readiness. */
export const PLATFORM_STORE_HEALTH = Symbol("PlatformStoreHealth");
/** `(organizationId) => Promise<MetadataDeployResult>` — deploys the TDM package into that tenant's connected org. */
export const TENANT_METADATA_DEPLOYER = Symbol("TenantMetadataDeployer");
export const REMINDER_LOG_REPOSITORY = Symbol("ReminderLogRepository");
export const FOLLOW_UP_LOG_REPOSITORY = Symbol("FollowUpLogRepository");
export const MAGIC_LOGIN_REPOSITORY = Symbol("MagicLoginRepository");
export const CUSTOMER_PASSWORD_TOKEN_REPOSITORY = Symbol("CustomerPasswordTokenRepository");
export const STAFF_USER_REPOSITORY = Symbol("StaffUserRepository");
export const STAFF_REFRESH_TOKEN_REPOSITORY = Symbol("StaffRefreshTokenRepository");
export const STAFF_OAUTH_STATE_REPOSITORY = Symbol("StaffOAuthStateRepository");
export const NOTIFICATION_TEMPLATE_REPOSITORY = Symbol("NotificationTemplateRepository");
export const ASSET_REPOSITORY = Symbol("AssetRepository");
export const ORGANIZATION_REPOSITORY = Symbol("OrganizationRepository");
