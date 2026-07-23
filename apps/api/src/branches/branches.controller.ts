import { Controller, Get, Inject } from "@nestjs/common";
import { BranchRepository } from "@tdm/domain";
import { BRANCH_REPOSITORY } from "../infrastructure/tokens";

@Controller("branches")
export class BranchesController {
  constructor(@Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository) {}

  @Get()
  async list() {
    const branches = await this.branches.findAll();
    return branches.map((b) => {
      const props = b.toProps();
      return {
        id: props.id,
        name: props.name,
        address: props.address,
        phone: props.phone,
        operatingHours: props.operatingHours,
        managerName: props.managerName,
      };
    });
  }
}
