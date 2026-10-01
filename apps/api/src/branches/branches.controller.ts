import { Controller, Get, Inject } from "@nestjs/common";
import { BranchRepository } from "@tdm/domain";
import { BRANCH_REPOSITORY } from "../infrastructure/tokens";
import { RegionalSettingsService } from "../config/regional-settings.service";

@Controller("branches")
export class BranchesController {
  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
    private readonly regional: RegionalSettingsService,
  ) {}

  @Get()
  async list() {
    const branches = await this.branches.findAll();
    const zones = await this.regional.timeZonesOf(branches.map((b) => b.toProps().dealershipId));
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
        /** Where the branch is — its bookings' times are shown in this zone. */
        timeZone: zones.get(props.dealershipId)!,
      };
    });
  }
}
