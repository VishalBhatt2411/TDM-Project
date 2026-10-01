import { Module } from "@nestjs/common";
import { PlatformController } from "./platform.controller";
import { PlatformOperatorGuard } from "./platform-operator.guard";
import { PlatformService } from "./platform.service";

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, PlatformOperatorGuard],
})
export class PlatformModule {}
