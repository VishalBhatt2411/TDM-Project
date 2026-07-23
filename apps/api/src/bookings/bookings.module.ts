import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { ReminderScheduler } from "./reminder.scheduler";
import { FollowUpScheduler } from "./followup.scheduler";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [BookingsController],
  providers: [BookingsService, ReminderScheduler, FollowUpScheduler],
})
export class BookingsModule {}
