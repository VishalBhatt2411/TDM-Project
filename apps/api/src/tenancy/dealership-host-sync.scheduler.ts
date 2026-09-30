import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DealershipRepository } from "@tdm/domain";
import { DealershipHostEntry, OrganizationRepository } from "@tdm/postgres-adapter";
import { DEALERSHIP_REPOSITORY, ORGANIZATION_REPOSITORY } from "../infrastructure/tokens";
import { isAssignableSubdomainLabel } from "./organization-slug";
import { runForEachTenant } from "./tenant-context";

/** Same shape the Dealership__c.Custom_Domain_Format validation rule enforces. */
const HOSTNAME_PATTERN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAX_HOSTNAME_LENGTH = 253;

/**
 * Mirrors each tenant's dealer URLs (Dealership__c.Url_Slug__c / Custom_Domain__c) into the
 * host registry the tenant resolver reads, so a new or renamed dealership goes live within a
 * few minutes without a platform-side step. The data provider stays the source of truth; the
 * registry only exists because routing must happen before any tenant's org can be chosen.
 */
@Injectable()
export class DealershipHostSyncScheduler {
  private readonly logger = new Logger(DealershipHostSyncScheduler.name);

  constructor(
    @Inject(DEALERSHIP_REPOSITORY) private readonly dealerships: DealershipRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
  ) {}

  @Cron("*/5 * * * *")
  async syncAll(): Promise<void> {
    await runForEachTenant(
      await this.organizations.listConnectedIds(),
      (organizationId) => this.syncTenant(organizationId),
      this.logger,
      "dealership_host_sync_failed",
    );
  }

  private async syncTenant(organizationId: string): Promise<void> {
    const entries: DealershipHostEntry[] = [];
    for (const dealership of await this.dealerships.findAll()) {
      if (!dealership.isActive) continue;
      const label = dealership.urlSlug?.trim().toLowerCase();
      if (!isAssignableSubdomainLabel(label)) {
        this.logger.warn(JSON.stringify({ event: "dealership_host_invalid", organizationId, dealershipId: dealership.id, kind: "label" }));
        continue;
      }
      const customDomain = dealership.customDomain?.trim().toLowerCase();
      const validDomain = !!customDomain && customDomain.length <= MAX_HOSTNAME_LENGTH && HOSTNAME_PATTERN.test(customDomain);
      if (customDomain && !validDomain) {
        this.logger.warn(
          JSON.stringify({ event: "dealership_host_invalid", organizationId, dealershipId: dealership.id, kind: "custom_domain" }),
        );
      }
      entries.push({ dealershipId: dealership.id, label, customDomain: validDomain ? customDomain : undefined });
    }

    const conflicts = await this.organizations.syncDealershipHosts(organizationId, entries);
    for (const conflict of conflicts) {
      this.logger.warn(JSON.stringify({ event: "dealership_host_conflict", organizationId, ...conflict }));
    }
  }
}
