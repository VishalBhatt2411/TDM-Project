import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { AuthModule } from "./auth/auth.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { BookingsModule } from "./bookings/bookings.module";
import { DealershipConfigModule } from "./config/config.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { BranchesModule } from "./branches/branches.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    InfrastructureModule,
    AuthModule,
    VehiclesModule,
    BookingsModule,
    DealershipConfigModule,
    AnalyticsModule,
    BranchesModule,
  ],
})
export class AppModule {}
