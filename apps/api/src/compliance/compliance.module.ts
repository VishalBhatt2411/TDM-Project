import { Module } from "@nestjs/common";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { LicenseAiService } from "./license-ai.service";

@Module({
  controllers: [ComplianceController],
  providers: [ComplianceService, LicenseAiService],
  exports: [LicenseAiService],
})
export class ComplianceModule {}
