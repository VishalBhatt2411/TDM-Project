import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import { isUUID } from "class-validator";
import { Request } from "express";
import { OnboardingService } from "./onboarding.service";

/** Header the wizard sends its setup token in — never a query parameter, so it stays out of URLs and logs. */
export const ONBOARDING_TOKEN_HEADER = "x-onboarding-token";
const ONBOARDING_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * The wizard's endpoints are public (no account exists yet), so an organization id alone
 * must never be enough to read or change a tenant's setup: the caller also presents the
 * setup token issued once when the organization was created. A wrong or missing token is
 * indistinguishable from an unknown organization.
 */
@Injectable()
export class OnboardingTokenGuard implements CanActivate {
  constructor(private readonly onboarding: OnboardingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const organizationId = req.params.organizationId ?? "";
    const token = req.header(ONBOARDING_TOKEN_HEADER);
    if (
      !isUUID(organizationId) ||
      typeof token !== "string" ||
      !ONBOARDING_TOKEN_PATTERN.test(token) ||
      !(await this.onboarding.holdsSetupToken(organizationId, token))
    ) {
      throw new NotFoundException("Organization not found.");
    }
    return true;
  }
}
