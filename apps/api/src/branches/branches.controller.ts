import { Controller, Get, Inject } from "@nestjs/common";
import { BranchRepository } from "@tdm/domain";
import { BRANCH_REPOSITORY } from "../infrastructure/tokens";
import { TenantContext } from "../tenancy/tenant-context";

@Controller("branches")
export class BranchesController {
  constructor(@Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository) {}

  @Get()
  async list() {
    const branches = await this.branches.findAll(TenantContext.hostDealershipScope());
    return branches.map((b) => {
      const props = b.toProps();
      return {
        id: props.id,
        dealershipId: props.dealershipId,
        name: props.name,
        address: props.address,
        geo: props.geo,
        phone: props.phone,
        operatingHours: props.operatingHours,
        managerName: props.managerName,
      };
    });
  }
}
