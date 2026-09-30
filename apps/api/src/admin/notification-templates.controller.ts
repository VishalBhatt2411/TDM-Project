import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, ParseEnumPipe, Put, Query, UseGuards } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { AuditLogRepository, NotificationTemplateRepository } from "@tdm/domain";
import { NOTIFICATION_TEMPLATE_KEYS, NotificationTemplateKey } from "../notifications/email-templates";
import { AUDIT_LOG_REPOSITORY, NOTIFICATION_TEMPLATE_REPOSITORY } from "../infrastructure/tokens";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { CurrentStaff } from "./current-staff.decorator";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { PERMISSIONS } from "./permissions";
import { ConfigScopeQueryDto, ConfigScopeResolver } from "./config-scope";

const KEYS = NOTIFICATION_TEMPLATE_KEYS.map((t) => t.key);
const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() || undefined : value);

/** Templates are overridden company-wide or per dealership only — never per branch. */
class TemplateScopeQueryDto extends ConfigScopeQueryDto {}

class UpdateTemplateDto extends TemplateScopeQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  note?: string;
}

@Controller("admin/notification-templates")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class NotificationTemplatesController {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY) private readonly templates: NotificationTemplateRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly scopes: ConfigScopeResolver,
  ) {}

  /** Overrides at the requested scope; at a dealership, also the company-wide ones it inherits. */
  @Get()
  async list(@Query() query: TemplateScopeQueryDto, @CurrentStaffAccess() access: StaffAccess) {
    const { dealershipId } = await this.resolveScope(access, query);
    const [own, inherited] = await Promise.all([
      this.templates.findAtScope(dealershipId),
      dealershipId ? this.templates.findAtScope(undefined) : Promise.resolve([]),
    ]);
    const ownByKey = new Map(own.map((o) => [o.key, o]));
    const inheritedByKey = new Map(inherited.map((o) => [o.key, o]));
    return NOTIFICATION_TEMPLATE_KEYS.map((t) => {
      const override = ownByKey.get(t.key);
      const companyOverride = inheritedByKey.get(t.key);
      return {
        key: t.key,
        label: t.label,
        defaultSubject: t.defaultSubject,
        subject: override?.subject,
        note: override?.note,
        isCustomized: !!override,
        updatedAt: override?.updatedAt.toISOString(),
        inherited: companyOverride ? { subject: companyOverride.subject, note: companyOverride.note } : undefined,
      };
    });
  }

  @Put(":key")
  async update(
    @Param("key", new ParseEnumPipe(KEYS)) key: NotificationTemplateKey,
    @Body() dto: UpdateTemplateDto,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    if (!dto.subject && !dto.note) {
      throw new BadRequestException("Set a custom subject or a note — or revert the template to its default.");
    }
    const { dealershipId } = await this.resolveScope(access, dto);
    const saved = await this.templates.upsert(key, { subject: dto.subject, note: dto.note }, dealershipId);
    await this.auditLog.append({
      actorId: staff.staffUserId,
      action: "NOTIFICATION_TEMPLATE_UPDATED",
      entityType: "NotificationTemplate",
      entityId: key,
      dealershipId,
      metadata: { dealershipId: dealershipId ?? null },
    });
    return { key: saved.key, subject: saved.subject, note: saved.note, updatedAt: saved.updatedAt.toISOString() };
  }

  @Delete(":key")
  async revert(
    @Param("key", new ParseEnumPipe(KEYS)) key: NotificationTemplateKey,
    @Query() query: TemplateScopeQueryDto,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    const { dealershipId } = await this.resolveScope(access, query);
    await this.templates.delete(key, dealershipId);
    await this.auditLog.append({
      actorId: staff.staffUserId,
      action: "NOTIFICATION_TEMPLATE_REVERTED",
      entityType: "NotificationTemplate",
      entityId: key,
      dealershipId,
      metadata: { dealershipId: dealershipId ?? null },
    });
    return { reverted: true };
  }

  private resolveScope(access: StaffAccess, query: TemplateScopeQueryDto) {
    if (query.branchId) throw new BadRequestException("Notification templates can't be customized per branch.");
    return this.scopes.resolve(access, query);
  }
}
