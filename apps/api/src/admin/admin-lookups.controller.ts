import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { BranchRepository, DealershipRepository, SalesRepRepository } from "@tdm/domain";
import { BRANCH_REPOSITORY, DEALERSHIP_REPOSITORY, SALES_REP_REPOSITORY } from "../infrastructure/tokens";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";

/**
 * Small reference-data endpoints (dealerships, branches, sales reps) used to populate admin
 * console dropdowns — open to any staff member, limited to the dealerships they hold an
 * assignment at (every dealership for a Company Admin). A rep needs their colleagues to hand
 * a drive off; each write still enforces its own permission.
 */
@Controller("admin/lookups")
@UseGuards(StaffAuthGuard, PermissionGuard)
export class AdminLookupsController {
  constructor(
    @Inject(SALES_REP_REPOSITORY) private readonly salesReps: SalesRepRepository,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
    @Inject(DEALERSHIP_REPOSITORY) private readonly dealerships: DealershipRepository,
  ) {}

  @Get("sales-reps")
  async listSalesReps(@CurrentStaffAccess() access: StaffAccess) {
    const reps = await this.salesReps.findAllActive(access.dealershipScope());
    return reps.map((r) => {
      const props = r.toProps();
      return { id: props.id, name: props.name, email: props.email, dealershipId: props.dealershipId, branchId: props.branchId };
    });
  }

  @Get("branches")
  async listBranches(@CurrentStaffAccess() access: StaffAccess) {
    const branches = await this.branches.findAll(access.dealershipScope());
    return branches.map((b) => {
      const props = b.toProps();
      return { id: props.id, name: props.name, dealershipId: props.dealershipId };
    });
  }

  @Get("dealerships")
  async listDealerships(@CurrentStaffAccess() access: StaffAccess) {
    const { dealershipIds } = access.dealershipScope();
    const dealerships = await this.dealerships.findAll();
    return dealerships
      .filter((d) => d.isActive && (!dealershipIds || dealershipIds.includes(d.id)))
      .map((d) => {
        const props = d.toProps();
        return { id: props.id, name: props.name };
      });
  }
}
