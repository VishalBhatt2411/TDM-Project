import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { AuthModule } from "./auth/auth.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { BookingsModule } from "./bookings/bookings.module";
import { CustomersModule } from "./customers/customers.module";
import { DealershipConfigModule } from "./config/config.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { BranchesModule } from "./branches/branches.module";
import { AdminModule } from "./admin/admin.module";
import { HealthModule } from "./health/health.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { AssetsModule } from "./assets/assets.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { TenantMiddleware } from "./tenancy/tenant.middleware";
import { JobsModule } from "./jobs/jobs.module";
import { PlatformModule } from "./platform/platform.module";
import { env } from "./common/env";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Without the schedule module the @Cron handlers stay inert; JobsModule's triggers run them instead.
    ...(env.schedulerMode === "in-process" ? [ScheduleModule.forRoot()] : []),
    // Baseline abuse protection for every endpoint; auth-sensitive endpoints
    // (login, OTP, password reset) apply a stricter override via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    InfrastructureModule,
    TenancyModule,
    HealthModule,
    AuthModule,
    VehiclesModule,
    BookingsModule,
    CustomersModule,
    DealershipConfigModule,
    AnalyticsModule,
    BranchesModule,
    AdminModule,
    ComplianceModule,
    AssetsModule,
    OnboardingModule,
    JobsModule,
    PlatformModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
