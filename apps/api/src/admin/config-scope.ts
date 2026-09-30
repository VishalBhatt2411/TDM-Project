import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { IsOptional } from "class-validator";
import { BranchRepository, ConfigScope, DealershipRepository } from "@tdm/domain";
import { BRANCH_REPOSITORY, DEALERSHIP_REPOSITORY } from "../infrastructure/tokens";
import { IsRecordId } from "../common/record-id";
import { PERMISSIONS } from "./permissions";
import type { StaffAccess } from "./staff-access";

/** Scope of a config read/write: a branch, a dealership, or (neither) company-wide. */
export class ConfigScopeQueryDto {
  @IsOptional()
  @IsRecordId()
  dealershipId?: string;

  @IsOptional()
  @IsRecordId()
  branchId?: string;
}

/**
 * Turns a requested config scope into a verified one: ids must exist in this tenant, a branch
 * must belong to the named dealership, and the staff member must hold MANAGE_CONFIG there —
 * company-wide settings need an unrestricted (Company Admin) grant, since they reach every dealership.
 */
@Injectable()
export class ConfigScopeResolver {
  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
    @Inject(DEALERSHIP_REPOSITORY) private readonly dealerships: DealershipRepository,
  ) {}

  async resolve(access: StaffAccess, requested: ConfigScopeQueryDto): Promise<ConfigScope> {
    let dealershipId: string | undefined;
    let branchId: string | undefined;

    if (requested.branchId) {
      const branch = await this.branches.findById(requested.branchId);
      if (!branch) throw new NotFoundException("Branch not found.");
      if (requested.dealershipId && requested.dealershipId !== branch.dealershipId) {
        throw new BadRequestException("That branch doesn't belong to the selected dealership.");
      }
      dealershipId = branch.dealershipId;
      branchId = branch.id;
    } else if (requested.dealershipId) {
      const dealership = await this.dealerships.findById(requested.dealershipId);
      if (!dealership) throw new NotFoundException("Dealership not found.");
      dealershipId = dealership.id;
    }

    const allowed = dealershipId
      ? access.canIn(PERMISSIONS.MANAGE_CONFIG, dealershipId)
      : access.scopeFor(PERMISSIONS.MANAGE_CONFIG)?.dealershipIds === undefined && access.can(PERMISSIONS.MANAGE_CONFIG);
    if (!allowed) {
      throw new ForbiddenException(
        dealershipId ? "You can't manage settings for this dealership." : "Only a company admin can manage company-wide settings.",
      );
    }
    return { dealershipId, branchId };
  }
}

/** Audit metadata describing where a config change applied. */
export function scopeMetadata(scope: ConfigScope): Record<string, unknown> {
  return { dealershipId: scope.dealershipId ?? null, branchId: scope.branchId ?? null };
}
