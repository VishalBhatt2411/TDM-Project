import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";

/**
 * Shared by AdminModule and any other module whose endpoints are staff-only
 * (e.g. AnalyticsModule) — kept separate from AdminModule itself so those modules
 * don't have to import Admin's controllers/services just to reuse its guards.
 */
@Module({
  imports: [AuthModule],
  providers: [StaffAuthGuard, PermissionGuard],
  exports: [StaffAuthGuard, PermissionGuard],
})
export class StaffAuthModule {}
