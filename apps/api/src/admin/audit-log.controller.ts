import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { AuditLogRepository } from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY } from "../infrastructure/tokens";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";

class QueryAuditLogDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
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
  query(@Query() query: QueryAuditLogDto) {
    return this.auditLog.query({
      entityType: query.entityType,
      actorId: query.actorId,
      limit: query.limit ?? 50,
    });
  }
}
