import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { BookingEmailContextService } from "./booking-email-context.service";

@Module({
  providers: [NotificationsService, BookingEmailContextService],
  exports: [NotificationsService, BookingEmailContextService],
})
export class NotificationsModule {}
