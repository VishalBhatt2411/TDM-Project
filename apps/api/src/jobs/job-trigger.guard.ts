import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { env } from "../common/env";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Admits an external scheduler presenting `Authorization: Bearer <JOB_TRIGGER_SECRET>`. With
 * in-process scheduling the trigger routes don't exist (404), so they can't be probed at all.
 */
@Injectable()
export class JobTriggerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = env.jobTriggerSecret;
    if (env.schedulerMode !== "external" || !secret) throw new NotFoundException();
    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    // Compare fixed-length digests so neither length nor content leaks through timing.
    if (!presented || !timingSafeEqual(digest(presented), digest(secret))) throw new UnauthorizedException();
    return true;
  }
}
