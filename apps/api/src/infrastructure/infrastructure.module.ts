import { Global, Logger, Module } from "@nestjs/common";
import { DataProviderHealth } from "@tdm/domain";
import {
  CustomerPasswordTokenRepository,
  FollowUpLogRepository,
  getPrismaClient,
  MagicLoginRepository,
  OrganizationRepository,
  PostgresAuditLogRepository,
  PostgresAuthRepository,
  ReminderLogRepository,
  StaffOAuthStateRepository,
  StaffRefreshTokenRepository,
  StaffUserRepository,
} from "@tdm/postgres-adapter";
import {
  deployTdmMetadata,
  SalesforceAnalyticsRepository,
  SalesforceAssetRepository,
  SalesforceBookingRepository,
  SalesforceBranchRepository,
  SalesforceCustomerRepository,
  SalesforceDealershipRepository,
  SalesforceBrandingRepository,
  SalesforceBrandAssetRepository,
  SalesforceRegionalSettingsRepository,
  SalesforceBookingScheduleRepository,
  SalesforceEmailSender,
  SalesforceFeatureFlagRepository,
  SalesforceIdentityProvider,
  SalesforceNotificationTemplateRepository,
  SalesforceSalesOpportunityRepository,
  SalesforceSalesRepRepository,
  SalesforceStaffAssignmentRepository,
  SalesforceStaffDirectory,
  SalesforceVehicleAllocationRepository,
  SalesforceVehicleRepository,
  SalesforceVehicleVariantRepository,
  SalesforceWishlistRepository,
  TenantSalesforceConnectionProvider,
} from "@tdm/salesforce-adapter";
import { SalesforceIdentityProviderFactory } from "./identity-provider-factory";
import { TenantMetadataDeployer } from "./metadata-deployer";
import {
  ANALYTICS_REPOSITORY,
  ASSET_REPOSITORY,
  AUDIT_LOG_REPOSITORY,
  AUTH_REPOSITORY,
  BOOKING_REPOSITORY,
  BRANCH_REPOSITORY,
  CUSTOMER_PASSWORD_TOKEN_REPOSITORY,
  CUSTOMER_REPOSITORY,
  DATA_PROVIDER_HEALTH,
  PLATFORM_STORE_HEALTH,
  DEALERSHIP_REPOSITORY,
  BRANDING_REPOSITORY,
  BRAND_ASSET_REPOSITORY,
  REGIONAL_SETTINGS_REPOSITORY,
  BOOKING_SCHEDULE_REPOSITORY,
  FEATURE_FLAG_REPOSITORY,
  FOLLOW_UP_LOG_REPOSITORY,
  MAGIC_LOGIN_REPOSITORY,
  NOTIFICATION_TEMPLATE_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  REMINDER_LOG_REPOSITORY,
  SALES_OPPORTUNITY_REPOSITORY,
  SALES_REP_REPOSITORY,
  SALESFORCE_IDENTITY_PROVIDER_FACTORY,
  STAFF_ASSIGNMENT_REPOSITORY,
  STAFF_DIRECTORY,
  STAFF_OAUTH_STATE_REPOSITORY,
  STAFF_REFRESH_TOKEN_REPOSITORY,
  STAFF_USER_REPOSITORY,
  TENANT_METADATA_DEPLOYER,
  VEHICLE_ALLOCATION_REPOSITORY,
  VEHICLE_REPOSITORY,
  VEHICLE_VARIANT_REPOSITORY,
  WISHLIST_REPOSITORY,
} from "./tokens";
import { env } from "../common/env";
import { EMAIL_SENDER } from "../notifications/email-sender";
import { TenantContext } from "../tenancy/tenant-context";

const logger = new Logger("InfrastructureModule");
const prisma = getPrismaClient();
const organizationRepository = new OrganizationRepository(prisma, env.encryptionKey);

const connectionProvider = new TenantSalesforceConnectionProvider({
  resolveOrganizationId: () => TenantContext.currentOrganizationId(),
  loadCredentials: (organizationId) => organizationRepository.loadConnectionCredentials(organizationId),
  onRefreshTokenRotated: async (organizationId, previousRefreshToken, refreshToken) => {
    const saved = await organizationRepository.saveRotatedRefreshToken(organizationId, previousRefreshToken, refreshToken);
    logger.log(JSON.stringify({ event: "salesforce_refresh_token_rotated", organizationId, saved }));
  },
  onCredentialsRejected: async (organizationId, rejectedRefreshToken) => {
    const marked = await organizationRepository.recordRefreshTokenRejected(
      organizationId,
      rejectedRefreshToken,
      "Salesforce rejected the stored refresh token (revoked or Connected App policy changed). Reconnect the org.",
    );
    logger.warn(JSON.stringify({ event: "salesforce_credentials_rejected", organizationId, marked }));
  },
});

const identityProviderFactory: SalesforceIdentityProviderFactory = async (organizationId, purpose) => {
  const credentials = await organizationRepository.loadConnectedAppCredentials(organizationId);
  if (!credentials) return null;
  return new SalesforceIdentityProvider({
    ...credentials,
    redirectUri: purpose === "onboarding" ? env.sfOnboardingRedirectUri : env.sfOAuthRedirectUri,
  });
};

/** Runs inside the target tenant's context so the deploy uses that org's stored (and auto-rotated) connection. */
const tenantMetadataDeployer: TenantMetadataDeployer = (organizationId) =>
  TenantContext.run(async () => deployTdmMetadata(await connectionProvider.getConnection()), organizationId);

const dataProviderHealth: DataProviderHealth = {
  name: "Salesforce",
  ping: () => connectionProvider.ping(),
};

const platformStoreHealth: DataProviderHealth = {
  name: "Postgres",
  ping: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
};

/** Emails go out under the tenant's own company name — never a hardcoded brand. */
const resolveSenderDisplayName = async (): Promise<string> => {
  const organizationId = TenantContext.currentOrganizationId();
  const organization = organizationId ? await organizationRepository.findById(organizationId) : null;
  return organization ? `${organization.name} Test Drives` : "Test Drives";
};


/**
 * The only module in the application allowed to know about Salesforce or Postgres.
 * Every other module depends solely on the repository tokens/interfaces from @tdm/domain.
 */
@Global()
@Module({
  providers: [
    { provide: SALESFORCE_IDENTITY_PROVIDER_FACTORY, useValue: identityProviderFactory },
    { provide: DATA_PROVIDER_HEALTH, useValue: dataProviderHealth },
    { provide: PLATFORM_STORE_HEALTH, useValue: platformStoreHealth },
    { provide: TENANT_METADATA_DEPLOYER, useValue: tenantMetadataDeployer },
    {
      provide: EMAIL_SENDER,
      useValue: new SalesforceEmailSender(connectionProvider, resolveSenderDisplayName, new Logger("EmailSender")),
    },
    { provide: CUSTOMER_REPOSITORY, useValue: new SalesforceCustomerRepository(connectionProvider) },
    { provide: VEHICLE_REPOSITORY, useValue: new SalesforceVehicleRepository(connectionProvider) },
    { provide: VEHICLE_VARIANT_REPOSITORY, useValue: new SalesforceVehicleVariantRepository(connectionProvider) },
    { provide: BRANCH_REPOSITORY, useValue: new SalesforceBranchRepository(connectionProvider) },
    { provide: DEALERSHIP_REPOSITORY, useValue: new SalesforceDealershipRepository(connectionProvider) },
    { provide: BRANDING_REPOSITORY, useValue: new SalesforceBrandingRepository(connectionProvider) },
    { provide: BRAND_ASSET_REPOSITORY, useValue: new SalesforceBrandAssetRepository(connectionProvider) },
    { provide: REGIONAL_SETTINGS_REPOSITORY, useValue: new SalesforceRegionalSettingsRepository(connectionProvider) },
    { provide: BOOKING_SCHEDULE_REPOSITORY, useValue: new SalesforceBookingScheduleRepository(connectionProvider) },
    { provide: SALES_REP_REPOSITORY, useValue: new SalesforceSalesRepRepository(connectionProvider) },
    { provide: STAFF_ASSIGNMENT_REPOSITORY, useValue: new SalesforceStaffAssignmentRepository(connectionProvider) },
    { provide: STAFF_DIRECTORY, useValue: new SalesforceStaffDirectory(connectionProvider) },
    { provide: BOOKING_REPOSITORY, useValue: new SalesforceBookingRepository(connectionProvider) },
    { provide: WISHLIST_REPOSITORY, useValue: new SalesforceWishlistRepository(connectionProvider) },
    { provide: VEHICLE_ALLOCATION_REPOSITORY, useValue: new SalesforceVehicleAllocationRepository(connectionProvider) },
    { provide: SALES_OPPORTUNITY_REPOSITORY, useValue: new SalesforceSalesOpportunityRepository(connectionProvider) },
    { provide: ANALYTICS_REPOSITORY, useValue: new SalesforceAnalyticsRepository(connectionProvider) },
    { provide: AUTH_REPOSITORY, useValue: new PostgresAuthRepository(prisma) },
    { provide: AUDIT_LOG_REPOSITORY, useValue: new PostgresAuditLogRepository(prisma, () => TenantContext.currentOrganizationId()) },
    { provide: FEATURE_FLAG_REPOSITORY, useValue: new SalesforceFeatureFlagRepository(connectionProvider) },
    { provide: REMINDER_LOG_REPOSITORY, useValue: new ReminderLogRepository(prisma) },
    { provide: FOLLOW_UP_LOG_REPOSITORY, useValue: new FollowUpLogRepository(prisma) },
    { provide: MAGIC_LOGIN_REPOSITORY, useValue: new MagicLoginRepository(prisma) },
    { provide: CUSTOMER_PASSWORD_TOKEN_REPOSITORY, useValue: new CustomerPasswordTokenRepository(prisma) },
    { provide: STAFF_USER_REPOSITORY, useValue: new StaffUserRepository(prisma) },
    { provide: STAFF_REFRESH_TOKEN_REPOSITORY, useValue: new StaffRefreshTokenRepository(prisma) },
    { provide: STAFF_OAUTH_STATE_REPOSITORY, useValue: new StaffOAuthStateRepository(prisma) },
    { provide: NOTIFICATION_TEMPLATE_REPOSITORY, useValue: new SalesforceNotificationTemplateRepository(connectionProvider) },
    { provide: ASSET_REPOSITORY, useValue: new SalesforceAssetRepository(connectionProvider) },
    { provide: ORGANIZATION_REPOSITORY, useValue: organizationRepository },
  ],
  exports: [
    SALESFORCE_IDENTITY_PROVIDER_FACTORY,
    DATA_PROVIDER_HEALTH,
    PLATFORM_STORE_HEALTH,
    TENANT_METADATA_DEPLOYER,
    EMAIL_SENDER,
    CUSTOMER_REPOSITORY,
    VEHICLE_REPOSITORY,
    VEHICLE_VARIANT_REPOSITORY,
    BRANCH_REPOSITORY,
    DEALERSHIP_REPOSITORY,
    BRANDING_REPOSITORY,
    BRAND_ASSET_REPOSITORY,
    REGIONAL_SETTINGS_REPOSITORY,
    BOOKING_SCHEDULE_REPOSITORY,
    SALES_REP_REPOSITORY,
    STAFF_ASSIGNMENT_REPOSITORY,
    STAFF_DIRECTORY,
    BOOKING_REPOSITORY,
    WISHLIST_REPOSITORY,
    VEHICLE_ALLOCATION_REPOSITORY,
    SALES_OPPORTUNITY_REPOSITORY,
    ANALYTICS_REPOSITORY,
    AUTH_REPOSITORY,
    AUDIT_LOG_REPOSITORY,
    FEATURE_FLAG_REPOSITORY,
      REMINDER_LOG_REPOSITORY,
    FOLLOW_UP_LOG_REPOSITORY,
    MAGIC_LOGIN_REPOSITORY,
    CUSTOMER_PASSWORD_TOKEN_REPOSITORY,
    STAFF_USER_REPOSITORY,
    STAFF_REFRESH_TOKEN_REPOSITORY,
    STAFF_OAUTH_STATE_REPOSITORY,
    NOTIFICATION_TEMPLATE_REPOSITORY,
    ASSET_REPOSITORY,
    ORGANIZATION_REPOSITORY,
  ],
})
export class InfrastructureModule {}
