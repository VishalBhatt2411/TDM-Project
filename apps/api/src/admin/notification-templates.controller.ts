import { Body, Controller, Delete, Get, Inject, Param, ParseEnumPipe, Put, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString } from "class-validator";
import { NotificationTemplateRepository } from "@tdm/domain";
import { NOTIFICATION_TEMPLATE_KEYS, NotificationTemplateKey } from "../notifications/email-templates";
import { NOTIFICATION_TEMPLATE_REPOSITORY } from "../infrastructure/tokens";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { CurrentStaff } from "./current-staff.decorator";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { PERMISSIONS } from "./permissions";

const KEYS = NOTIFICATION_TEMPLATE_KEYS.map((t) => t.key);

class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller("admin/notification-templates")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class NotificationTemplatesController {
  constructor(@Inject(NOTIFICATION_TEMPLATE_REPOSITORY) private readonly templates: NotificationTemplateRepository) {}

  @Get()
  async list() {
    const overrides = await this.templates.findAll();
    const overrideByKey = new Map(overrides.map((o) => [o.key, o]));
    return NOTIFICATION_TEMPLATE_KEYS.map((t) => {
      const override = overrideByKey.get(t.key);
      return {
        key: t.key,
        label: t.label,
        defaultSubject: t.defaultSubject,
        subject: override?.subject,
        note: override?.note,
        isCustomized: !!override,
        updatedAt: override?.updatedAt?.toISOString(),
        updatedBy: override?.updatedBy,
      };
    });
  }

  @Put(":key")
  async update(
    @Param("key", new ParseEnumPipe(KEYS)) key: NotificationTemplateKey,
    @Body() dto: UpdateTemplateDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    const saved = await this.templates.upsert(key, { subject: dto.subject, note: dto.note }, staff.staffUserId);
    return { key: saved.key, subject: saved.subject, note: saved.note, updatedAt: saved.updatedAt.toISOString(), updatedBy: saved.updatedBy };
  }

  @Delete(":key")
  async revert(@Param("key", new ParseEnumPipe(KEYS)) key: NotificationTemplateKey) {
    await this.templates.delete(key);
    return { reverted: true };
  }
}
