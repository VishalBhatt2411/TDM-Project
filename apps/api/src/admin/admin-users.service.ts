import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditLogRepository,
  BranchRepository,
  StaffAssignment,
  StaffAssignmentRepository,
  StaffDirectory,
  StaffRole,
} from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY, BRANCH_REPOSITORY, STAFF_ASSIGNMENT_REPOSITORY, STAFF_DIRECTORY } from "../infrastructure/tokens";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { PERMISSIONS } from "./permissions";
import type { StaffAccess } from "./staff-access";
import { StaffAccessService } from "./staff-access.service";
import { CreateStaffAssignmentDto, UpdateStaffAssignmentDto } from "./dto";

/**
 * Grants and edits staff assignments. The actor may only touch assignments at dealerships
 * where they hold MANAGE_USERS, and only a Company Admin may grant or modify the Company
 * Admin role — otherwise MANAGE_USERS would be a privilege-escalation path to every dealership.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(STAFF_ASSIGNMENT_REPOSITORY) private readonly assignments: StaffAssignmentRepository,
    @Inject(STAFF_DIRECTORY) private readonly directory: StaffDirectory,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly staffAccess: StaffAccessService,
  ) {}

  async list(access: StaffAccess) {
    const scope = access.scopeFor(PERMISSIONS.MANAGE_USERS) ?? { dealershipIds: [] };
    const assignments = await this.assignments.findAll({ ...scope, includeInactive: true });
    return assignments.map(toPublicDto);
  }

  searchDirectory(query?: string) {
    return this.directory.search(query);
  }

  async create(dto: CreateStaffAssignmentDto, actor: AuthenticatedStaff, access: StaffAccess) {
    this.assertMayGrant(access, dto.role, dto.dealershipId);
    const user = await this.directory.findById(dto.userId);
    if (!user?.isActive) {
      throw new BadRequestException("Unknown or inactive Salesforce user.");
    }
    await this.assertBranchInDealership(dto.branchId, dto.dealershipId);

    const saved = await this.assignments.save(
      StaffAssignment.create({
        userId: user.id,
        role: dto.role,
        dealershipId: dto.dealershipId,
        branchId: dto.branchId,
        maxDailyBookings: dto.maxDailyBookings,
        phone: dto.phone,
      }),
    );
    this.staffAccess.invalidate(actor.organizationId, saved.userId);
    await this.auditLog.append({
      actorId: actor.staffUserId,
      action: "STAFF_ASSIGNMENT_CREATED",
      entityType: "StaffAssignment",
      entityId: saved.id,
      dealershipId: saved.dealershipId ?? undefined,
      metadata: { userId: saved.userId, role: saved.role, dealershipId: saved.dealershipId ?? null },
    });
    return toPublicDto(StaffAssignment.restore({ ...saved.toProps(), userName: user.name, userEmail: user.email }));
  }

  async update(id: string, dto: UpdateStaffAssignmentDto, actor: AuthenticatedStaff, access: StaffAccess) {
    const existing = await this.assignments.findById(id);
    // An assignment outside the actor's scope is indistinguishable from a nonexistent one.
    if (!existing || !this.mayManage(access, existing.role, existing.dealershipId)) {
      throw new NotFoundException("Staff assignment not found.");
    }

    const patch = {
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.dealershipId !== undefined && { dealershipId: dto.dealershipId ?? undefined }),
      ...(dto.branchId !== undefined && { branchId: dto.branchId ?? undefined }),
      ...(dto.maxDailyBookings !== undefined && { maxDailyBookings: dto.maxDailyBookings ?? undefined }),
      ...(dto.phone !== undefined && { phone: dto.phone ?? undefined }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };
    existing.update(patch);
    this.assertMayGrant(access, existing.role, existing.dealershipId);
    if (dto.branchId !== undefined || dto.dealershipId !== undefined) {
      await this.assertBranchInDealership(existing.branchId, existing.dealershipId);
    }

    const saved = await this.assignments.save(existing);
    this.staffAccess.invalidate(actor.organizationId, saved.userId);
    await this.auditLog.append({
      actorId: actor.staffUserId,
      action: "STAFF_ASSIGNMENT_UPDATED",
      entityType: "StaffAssignment",
      entityId: id,
      dealershipId: saved.dealershipId ?? undefined,
      metadata: { userId: saved.userId, ...dto },
    });
    return toPublicDto(saved);
  }

  private mayManage(access: StaffAccess, role: StaffRole, dealershipId: string | undefined): boolean {
    if (role === "Company_Admin" || !dealershipId) return access.isCompanyAdmin;
    return access.canIn(PERMISSIONS.MANAGE_USERS, dealershipId);
  }

  private assertMayGrant(access: StaffAccess, role: StaffRole, dealershipId: string | undefined): void {
    if (role === "Company_Admin" && !access.isCompanyAdmin) {
      throw new ForbiddenException("Only a Company Admin can grant or modify the Company Admin role.");
    }
    if (role !== "Company_Admin" && dealershipId && !access.canIn(PERMISSIONS.MANAGE_USERS, dealershipId)) {
      throw new ForbiddenException("You can only manage staff at your own dealership.");
    }
  }

  /** A Sales Rep's branch must belong to the assignment's dealership, or they'd be auto-assigned another dealership's drives. */
  private async assertBranchInDealership(branchId: string | undefined, dealershipId: string | undefined): Promise<void> {
    if (!branchId) return;
    const branch = await this.branches.findById(branchId);
    if (!branch || branch.dealershipId !== dealershipId) {
      throw new BadRequestException("The branch must belong to the assignment's dealership.");
    }
  }
}

function toPublicDto(assignment: StaffAssignment) {
  const props = assignment.toProps();
  return {
    id: props.id,
    userId: props.userId,
    userName: props.userName,
    userEmail: props.userEmail,
    role: props.role,
    dealershipId: props.dealershipId,
    branchId: props.branchId,
    isActive: props.isActive,
    maxDailyBookings: props.maxDailyBookings,
    phone: props.phone,
  };
}
