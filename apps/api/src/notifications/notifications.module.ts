import { Module } from "@nestjs/common";
import { EMAIL_SENDER, SalesforceEmailSender } from "./email-sender";
import { NotificationsService } from "./notifications.service";
import { BookingEmailContextService } from "./booking-email-context.service";

@Module({
  providers: [{ provide: EMAIL_SENDER, useClass: SalesforceEmailSender }, NotificationsService, BookingEmailContextService],
  exports: [NotificationsService, BookingEmailContextService],
})
export class NotificationsModule {}
