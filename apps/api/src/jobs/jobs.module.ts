import { Module } from "@nestjs/common";
import { BookingsModule } from "../bookings/bookings.module";
import { TenancyModule } from "../tenancy/tenancy.module";
import { JobsController } from "./jobs.controller";
import { JobTriggerGuard } from "./job-trigger.guard";

@Module({
  imports: [BookingsModule, TenancyModule],
  controllers: [JobsController],
  providers: [JobTriggerGuard],
})
export class JobsModule {}
