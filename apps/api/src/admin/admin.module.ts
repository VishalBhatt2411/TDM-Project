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
import { FeatureFlagsController } from "./feature-flags.controller";
import { AuditLogController } from "./audit-log.controller";
import { AdminBranchesController } from "./admin-branches.controller";
import { AdminVehiclesController } from "./admin-vehicles.controller";
import { AdminVehicleAllocationsController } from "./admin-vehicle-allocations.controller";
import { SystemHealthController } from "./system-health.controller";
import { NotificationTemplatesController } from "./notification-templates.controller";
import { StaffAuthModule } from "./staff-auth.module";
import { AdminComplianceController } from "./admin-compliance.controller";
import { AdminComplianceService } from "./admin-compliance.service";
import { ComplianceModule } from "../compliance/compliance.module";

@Module({
  imports: [AuthModule, NotificationsModule, BookingsModule, StaffAuthModule, ComplianceModule],
  controllers: [
    AdminAuthController,
    AdminUsersController,
    AdminBookingsController,
    AdminLookupsController,
    FeatureFlagsController,
    AuditLogController,
    AdminBranchesController,
    AdminVehiclesController,
    AdminVehicleAllocationsController,
    SystemHealthController,
    NotificationTemplatesController,
    AdminComplianceController,
  ],
  providers: [AdminAuthService, AdminUsersService, AdminBookingsService, AdminComplianceService],
})
export class AdminModule {}
