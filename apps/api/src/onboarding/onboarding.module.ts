import { Module } from "@nestjs/common";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";
import { OnboardingTokenGuard } from "./onboarding-token.guard";

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingTokenGuard],
})
export class OnboardingModule {}
