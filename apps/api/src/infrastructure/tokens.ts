/**
 * DI tokens for the repository interfaces defined in @tdm/domain. Every domain
 * module injects against these tokens, never against a concrete adapter class —
 * this is the seam that lets Salesforce be swapped for another provider later.
 */
export const CUSTOMER_REPOSITORY = Symbol("CustomerRepository");
export const VEHICLE_REPOSITORY = Symbol("VehicleRepository");
export const BRANCH_REPOSITORY = Symbol("BranchRepository");
export const SALES_REP_REPOSITORY = Symbol("SalesRepRepository");
export const BOOKING_REPOSITORY = Symbol("BookingRepository");
export const WISHLIST_REPOSITORY = Symbol("WishlistRepository");
export const VEHICLE_ALLOCATION_REPOSITORY = Symbol("VehicleAllocationRepository");
export const SALES_OPPORTUNITY_REPOSITORY = Symbol("SalesOpportunityRepository");
export const AUTH_REPOSITORY = Symbol("AuthRepository");
export const AUDIT_LOG_REPOSITORY = Symbol("AuditLogRepository");
export const FEATURE_FLAG_REPOSITORY = Symbol("FeatureFlagRepository");
export const VEHICLE_VARIANT_REPOSITORY = Symbol("VehicleVariantRepository");
export const ANALYTICS_REPOSITORY = Symbol("AnalyticsRepository");
export const SALESFORCE_CONNECTION_PROVIDER = Symbol("SalesforceConnectionProvider");
export const DEALERSHIP_CONFIG_REPOSITORY = Symbol("DealershipConfigRepository");
export const REMINDER_LOG_REPOSITORY = Symbol("ReminderLogRepository");
export const FOLLOW_UP_LOG_REPOSITORY = Symbol("FollowUpLogRepository");
export const MAGIC_LOGIN_REPOSITORY = Symbol("MagicLoginRepository");
export const CUSTOMER_PASSWORD_TOKEN_REPOSITORY = Symbol("CustomerPasswordTokenRepository");
export const STAFF_USER_REPOSITORY = Symbol("StaffUserRepository");
export const STAFF_PASSWORD_TOKEN_REPOSITORY = Symbol("StaffPasswordTokenRepository");
export const STAFF_REFRESH_TOKEN_REPOSITORY = Symbol("StaffRefreshTokenRepository");
