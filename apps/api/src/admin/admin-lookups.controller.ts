import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { BranchRepository, SalesRepRepository } from "@tdm/domain";
import { BRANCH_REPOSITORY, SALES_REP_REPOSITORY } from "../infrastructure/tokens";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";

/** Small reference-data endpoints (branches, sales reps) used to populate admin console dropdowns. */
@Controller("admin/lookups")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_BOOKINGS)
export class AdminLookupsController {
  constructor(
    @Inject(SALES_REP_REPOSITORY) private readonly salesReps: SalesRepRepository,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
  ) {}

  @Get("sales-reps")
  async listSalesReps() {
    const reps = await this.salesReps.findAllActive();
    return reps.map((r) => {
      const props = r.toProps();
      return { id: props.id, name: props.name, email: props.email, branchId: props.branchId };
    });
  }

  @Get("branches")
  async listBranches() {
    const branches = await this.branches.findAll();
    return branches.map((b) => {
      const props = b.toProps();
      return { id: props.id, name: props.name };
    });
  }
}
