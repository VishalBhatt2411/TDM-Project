import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { AuditLogRepository } from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY } from "../infrastructure/tokens";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import { StaffAccess } from "./staff-access";

class QueryAuditLogDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

@Controller("admin/audit-log")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.VIEW_AUDIT_LOG)
export class AuditLogController {
  constructor(@Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository) {}

  @Get()
  query(@Query() query: QueryAuditLogDto, @CurrentStaffAccess() access: StaffAccess) {
    return this.auditLog.query({
      entityType: query.entityType,
      actorId: query.actorId,
      limit: query.limit ?? 50,
      // PermissionGuard already rejected viewers without the permission anywhere.
      scope: access.scopeFor(PERMISSIONS.VIEW_AUDIT_LOG) ?? { dealershipIds: [] },
    });
  }
}
