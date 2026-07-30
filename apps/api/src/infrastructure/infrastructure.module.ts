import { Global, Module } from "@nestjs/common";
import {
  CustomerPasswordTokenRepository,
  DealershipConfigRepository,
  FollowUpLogRepository,
  getPrismaClient,
  MagicLoginRepository,
  PostgresAuditLogRepository,
  PostgresAuthRepository,
  PostgresFeatureFlagRepository,
  ReminderLogRepository,
  StaffRefreshTokenRepository,
  StaffUserRepository,
} from "@tdm/postgres-adapter";
import {
  SalesforceAnalyticsRepository,
  SalesforceBookingRepository,
  SalesforceBranchRepository,
  SalesforceConnectionProvider,
  SalesforceCustomerRepository,
  SalesforceIdentityProvider,
  SalesforceSalesOpportunityRepository,
  SalesforceVehicleAllocationRepository,
  SalesforceVehicleRepository,
  SalesforceVehicleVariantRepository,
  SalesforceWishlistRepository,
} from "@tdm/salesforce-adapter";
import { StaffSalesRepRepository } from "./staff-sales-rep.repository";
import {
  ANALYTICS_REPOSITORY,
  AUDIT_LOG_REPOSITORY,
  AUTH_REPOSITORY,
  BOOKING_REPOSITORY,
  BRANCH_REPOSITORY,
  CUSTOMER_PASSWORD_TOKEN_REPOSITORY,
  CUSTOMER_REPOSITORY,
  DEALERSHIP_CONFIG_REPOSITORY,
  FEATURE_FLAG_REPOSITORY,
  FOLLOW_UP_LOG_REPOSITORY,
  MAGIC_LOGIN_REPOSITORY,
  REMINDER_LOG_REPOSITORY,
  SALES_OPPORTUNITY_REPOSITORY,
  SALES_REP_REPOSITORY,
  SALESFORCE_CONNECTION_PROVIDER,
  SALESFORCE_IDENTITY_PROVIDER,
  STAFF_REFRESH_TOKEN_REPOSITORY,
  STAFF_USER_REPOSITORY,
  VEHICLE_ALLOCATION_REPOSITORY,
  VEHICLE_REPOSITORY,
  VEHICLE_VARIANT_REPOSITORY,
  WISHLIST_REPOSITORY,
} from "./tokens";

const connectionProvider = new SalesforceConnectionProvider();
const identityProvider = new SalesforceIdentityProvider({
  clientId: process.env.SF_OAUTH_CLIENT_ID ?? "",
  clientSecret: process.env.SF_OAUTH_CLIENT_SECRET ?? "",
  redirectUri: process.env.SF_OAUTH_REDIRECT_URI ?? "http://localhost:3000/api/v1/admin/auth/salesforce/callback",
  loginUrl: process.env.SF_LOGIN_URL,
});
const prisma = getPrismaClient();
const bookingRepository = new SalesforceBookingRepository(connectionProvider);
const staffUserRepository = new StaffUserRepository(prisma);

/**
 * The only module in the application allowed to know about Salesforce or Postgres.
 * Every other module depends solely on the repository tokens/interfaces from @tdm/domain.
 */
@Global()
@Module({
  providers: [
    { provide: SALESFORCE_CONNECTION_PROVIDER, useValue: connectionProvider },
    { provide: SALESFORCE_IDENTITY_PROVIDER, useValue: identityProvider },
    { provide: CUSTOMER_REPOSITORY, useValue: new SalesforceCustomerRepository(connectionProvider) },
    { provide: VEHICLE_REPOSITORY, useValue: new SalesforceVehicleRepository(connectionProvider) },
    { provide: VEHICLE_VARIANT_REPOSITORY, useValue: new SalesforceVehicleVariantRepository(connectionProvider) },
    { provide: BRANCH_REPOSITORY, useValue: new SalesforceBranchRepository(connectionProvider) },
    { provide: SALES_REP_REPOSITORY, useValue: new StaffSalesRepRepository(staffUserRepository, bookingRepository) },
    { provide: BOOKING_REPOSITORY, useValue: bookingRepository },
    { provide: WISHLIST_REPOSITORY, useValue: new SalesforceWishlistRepository(connectionProvider) },
    { provide: VEHICLE_ALLOCATION_REPOSITORY, useValue: new SalesforceVehicleAllocationRepository(connectionProvider) },
    { provide: SALES_OPPORTUNITY_REPOSITORY, useValue: new SalesforceSalesOpportunityRepository(connectionProvider) },
    { provide: ANALYTICS_REPOSITORY, useValue: new SalesforceAnalyticsRepository(connectionProvider) },
    { provide: AUTH_REPOSITORY, useValue: new PostgresAuthRepository(prisma) },
    { provide: AUDIT_LOG_REPOSITORY, useValue: new PostgresAuditLogRepository(prisma) },
    { provide: FEATURE_FLAG_REPOSITORY, useValue: new PostgresFeatureFlagRepository(prisma) },
    { provide: DEALERSHIP_CONFIG_REPOSITORY, useValue: new DealershipConfigRepository(prisma) },
    { provide: REMINDER_LOG_REPOSITORY, useValue: new ReminderLogRepository(prisma) },
    { provide: FOLLOW_UP_LOG_REPOSITORY, useValue: new FollowUpLogRepository(prisma) },
    { provide: MAGIC_LOGIN_REPOSITORY, useValue: new MagicLoginRepository(prisma) },
    { provide: CUSTOMER_PASSWORD_TOKEN_REPOSITORY, useValue: new CustomerPasswordTokenRepository(prisma) },
    { provide: STAFF_USER_REPOSITORY, useValue: staffUserRepository },
    { provide: STAFF_REFRESH_TOKEN_REPOSITORY, useValue: new StaffRefreshTokenRepository(prisma) },
  ],
  exports: [
    SALESFORCE_CONNECTION_PROVIDER,
    SALESFORCE_IDENTITY_PROVIDER,
    CUSTOMER_REPOSITORY,
    VEHICLE_REPOSITORY,
    VEHICLE_VARIANT_REPOSITORY,
    BRANCH_REPOSITORY,
    SALES_REP_REPOSITORY,
    BOOKING_REPOSITORY,
    WISHLIST_REPOSITORY,
    VEHICLE_ALLOCATION_REPOSITORY,
    SALES_OPPORTUNITY_REPOSITORY,
    ANALYTICS_REPOSITORY,
    AUTH_REPOSITORY,
    AUDIT_LOG_REPOSITORY,
    FEATURE_FLAG_REPOSITORY,
    DEALERSHIP_CONFIG_REPOSITORY,
    REMINDER_LOG_REPOSITORY,
    FOLLOW_UP_LOG_REPOSITORY,
    MAGIC_LOGIN_REPOSITORY,
    CUSTOMER_PASSWORD_TOKEN_REPOSITORY,
    STAFF_USER_REPOSITORY,
    STAFF_REFRESH_TOKEN_REPOSITORY,
  ],
})
export class InfrastructureModule {}
