import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { OrganizationRepository } from "@tdm/postgres-adapter";
import { ORGANIZATION_REPOSITORY } from "../infrastructure/tokens";
import { CustomDomainService } from "./custom-domain.service";
import { runForEachTenant } from "./tenant-context";

/**
 * Mirrors each tenant's dealer URLs into the host registry the tenant resolver reads, and
 * brings live custom domains whose DNS ownership proof has appeared, so a new or renamed
 * dealership goes live within a few minutes without a platform-side step. The data provider
 * stays the source of truth; the registry only exists because routing must happen before any
 * tenant's org can be chosen.
 */
@Injectable()
export class DealershipHostSyncScheduler {
  private readonly logger = new Logger(DealershipHostSyncScheduler.name);

  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    private readonly domains: CustomDomainService,
  ) {}

  @Cron("*/5 * * * *")
  async syncAll(): Promise<void> {
    await runForEachTenant(
      await this.organizations.listConnectedIds(),
      (organizationId) => this.domains.syncTenant(organizationId),
      this.logger,
      "dealership_host_sync_failed",
    );
  }
}
