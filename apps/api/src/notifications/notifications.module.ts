import { Module } from "@nestjs/common";
import { DealershipConfigModule } from "../config/config.module";
import { NotificationsService } from "./notifications.service";
import { BookingEmailContextService } from "./booking-email-context.service";

@Module({
  imports: [DealershipConfigModule],
  providers: [NotificationsService, BookingEmailContextService],
  exports: [NotificationsService, BookingEmailContextService],
})
export class NotificationsModule {}
