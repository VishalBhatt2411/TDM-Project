import { Module } from "@nestjs/common";
import { BranchesController } from "./branches.controller";
import { DealershipConfigModule } from "../config/config.module";

@Module({
  imports: [DealershipConfigModule],
  controllers: [BranchesController],
})
export class BranchesModule {}
