import { Controller, Get, Inject } from "@nestjs/common";
import { DealershipConfigRepository } from "@tdm/postgres-adapter";
import { DEALERSHIP_CONFIG_REPOSITORY } from "../infrastructure/tokens";

@Controller("config")
export class ConfigController {
  constructor(@Inject(DEALERSHIP_CONFIG_REPOSITORY) private readonly dealershipConfig: DealershipConfigRepository) {}

  @Get("dealership")
  getDealershipConfig() {
    return this.dealershipConfig.get();
  }
}
