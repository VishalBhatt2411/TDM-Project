import { Module } from "@nestjs/common";
import { EMAIL_SENDER, SalesforceEmailSender } from "./email-sender";
import { NotificationsService } from "./notifications.service";

@Module({
  providers: [{ provide: EMAIL_SENDER, useClass: SalesforceEmailSender }, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
