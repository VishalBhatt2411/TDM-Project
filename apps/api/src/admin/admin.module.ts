import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { BookingsModule } from "../bookings/bookings.module";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";
import { AdminBookingsController } from "./admin-bookings.controller";
import { AdminBookingsService } from "./admin-bookings.service";
import { AdminLookupsController } from "./admin-lookups.controller";
import { StaffAuthModule } from "./staff-auth.module";

@Module({
  imports: [AuthModule, NotificationsModule, BookingsModule, StaffAuthModule],
  controllers: [AdminAuthController, AdminUsersController, AdminBookingsController, AdminLookupsController],
  providers: [AdminAuthService, AdminUsersService, AdminBookingsService],
})
export class AdminModule {}
