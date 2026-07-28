import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogRepository } from "@tdm/domain";
import { StaffUserRepository } from "@tdm/postgres-adapter";
import { AUDIT_LOG_REPOSITORY, STAFF_USER_REPOSITORY } from "../infrastructure/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { CreateStaffUserDto, UpdateStaffUserDto } from "./dto";

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(STAFF_USER_REPOSITORY) private readonly staffUsers: StaffUserRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async list() {
    const users = await this.staffUsers.findAll();
    return users.map(toPublicDto);
  }

  async create(dto: CreateStaffUserDto, actor: AuthenticatedStaff) {
    // A Manager holding "manage_users" (a grantable permission) must not be able to
    // create a fellow Admin — only an actual Admin can mint another Admin. Without
    // this check, "manage_users" would be an indirect full-privilege-escalation path.
    if (dto.role === "Admin" && actor.role !== "Admin") {
      throw new ForbiddenException("Only an Admin can create another Admin account.");
    }

    const existing = await this.staffUsers.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException("A staff user with this email already exists.");
    }
    const staff = await this.staffUsers.create({
      email: dto.email,
      name: dto.name,
      role: dto.role,
      permissions: dto.permissions ?? [],
    });

    const webOrigin = process.env.ADMIN_WEB_ORIGIN ?? process.env.WEB_ORIGIN ?? "http://localhost:5173";
    await this.notifications.sendStaffAccessGranted(staff.email, staff.name, staff.role, `${webOrigin}/admin/login`);
    await this.auditLog.append({
      actorId: actor.staffUserId,
      action: "STAFF_USER_CREATED",
      entityType: "StaffUser",
      entityId: staff.id,
      metadata: { email: staff.email, role: staff.role },
    });

    return toPublicDto(staff);
  }

  async update(id: string, dto: UpdateStaffUserDto, actor: AuthenticatedStaff) {
    const existing = await this.staffUsers.findById(id);
    if (!existing) {
      throw new NotFoundException("Staff user not found.");
    }

    // Same privilege-escalation guard as create(): a non-Admin (even one with
    // "manage_users") can neither promote someone to Admin nor modify an existing
    // Admin's role/permissions/active status — only an Admin can touch Admin accounts.
    const targetIsOrWouldBeAdmin = existing.role === "Admin" || dto.role === "Admin";
    if (targetIsOrWouldBeAdmin && actor.role !== "Admin") {
      throw new ForbiddenException("Only an Admin can modify an Admin account or grant the Admin role.");
    }

    if (dto.email && dto.email.toLowerCase() !== existing.email) {
      const conflicting = await this.staffUsers.findByEmail(dto.email);
      if (conflicting && conflicting.id !== id) {
        throw new ConflictException("A staff user with this email already exists.");
      }
    }

    const updated = await this.staffUsers.update(id, dto);

    await this.auditLog.append({
      actorId: actor.staffUserId,
      action: "STAFF_USER_UPDATED",
      entityType: "StaffUser",
      entityId: id,
      metadata: { ...dto },
    });

    return toPublicDto(updated);
  }
}

function toPublicDto(staff: { id: string; email: string; name: string; role: string; permissions: string[]; isActive: boolean; createdAt: Date }) {
  return {
    id: staff.id,
    email: staff.email,
    name: staff.name,
    role: staff.role,
    permissions: staff.permissions,
    isActive: staff.isActive,
    createdAt: staff.createdAt.toISOString(),
  };
}
