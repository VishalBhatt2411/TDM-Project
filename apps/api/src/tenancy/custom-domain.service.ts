import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DealershipRepository } from "@tdm/domain";
import { DealershipHostEntry, OrganizationRepository, TenantCustomDomain } from "@tdm/postgres-adapter";
import { DEALERSHIP_REPOSITORY, ORGANIZATION_REPOSITORY } from "../infrastructure/tokens";
import { env } from "../common/env";
import { TenantContext } from "./tenant-context";
import { TenantResolverService } from "./tenant-resolver.service";
import { isAssignableSubdomainLabel } from "./organization-slug";
import {
  DomainVerificationRecord,
  hasVerificationRecord,
  isClaimableCustomDomain,
  verificationRecordFor,
} from "./custom-domain";

/** live: routed here. pending: waiting for the DNS proof. conflict: another site of this company already uses it. */
export type CustomDomainStatus = "live" | "pending" | "conflict";

export interface CustomDomainView {
  hostname: string;
  status: CustomDomainStatus;
  /** The TXT record to publish — present until the domain is live. */
  verification?: DomainVerificationRecord;
}

/** One customer site: the company-wide one (dealershipId null) or a dealer's. */
export interface SiteDomainsView {
  dealershipId: string | null;
  name: string;
  /** The site's platform address, "<label>.<base domain>"; absent for a dealership without a valid slug. */
  platformHost?: string;
  customDomains: CustomDomainView[];
}

/**
 * Custom domains for a tenant's customer sites. A dealer's domain lives in the data provider
 * (Dealership__c.Custom_Domain__c) and a company-wide one is a platform-side claim, but either
 * only starts routing once the domain's DNS publishes the tenant's verification record — so a
 * tenant can never capture a domain it doesn't control, and the real owner can always reclaim it.
 */
@Injectable()
export class CustomDomainService {
  private readonly logger = new Logger(CustomDomainService.name);

  constructor(
    @Inject(DEALERSHIP_REPOSITORY) private readonly dealerships: DealershipRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    private readonly resolver: TenantResolverService,
  ) {}

  /** The sites whose domains a caller may manage: the company-wide one only when `includeCompany`, dealers filtered by `canManage`. */
  async listSites(includeCompany: boolean, canManage: (dealershipId: string) => boolean): Promise<SiteDomainsView[]> {
    const organizationId = this.requireOrganizationId();
    const [organization, dealerships, routed, claims] = await Promise.all([
      this.organizations.findById(organizationId),
      this.dealerships.findAll(),
      this.organizations.listCustomDomains(organizationId),
      includeCompany ? this.organizations.listCompanyDomainClaims(organizationId) : Promise.resolve([]),
    ]);
    if (!organization) throw new NotFoundException("Unknown organization.");

    const sites: SiteDomainsView[] = [];
    if (includeCompany) {
      const live = routed.filter((d) => d.dealershipId === null).map((d) => d.hostname);
      sites.push({
        dealershipId: null,
        name: organization.name,
        platformHost: `${organization.slug}.${env.tenantBaseDomain}`,
        customDomains: [...new Set([...live, ...claims])].map((hostname) => this.view(organizationId, hostname, null, routed)),
      });
    }
    for (const dealership of dealerships) {
      if (!dealership.isActive || !canManage(dealership.id)) continue;
      const label = dealership.urlSlug?.trim().toLowerCase();
      const domain = dealership.customDomain?.trim().toLowerCase();
      sites.push({
        dealershipId: dealership.id,
        name: dealership.toProps().name,
        platformHost: isAssignableSubdomainLabel(label) ? `${label}.${env.tenantBaseDomain}` : undefined,
        customDomains: domain ? [this.view(organizationId, domain, dealership.id, routed)] : [],
      });
    }
    return sites;
  }

  async addCompanyDomain(hostname: string): Promise<void> {
    const organizationId = this.requireOrganizationId();
    await this.organizations.addCompanyDomainClaim(organizationId, this.requireClaimable(hostname));
  }

  async removeCompanyDomain(hostname: string): Promise<void> {
    const organizationId = this.requireOrganizationId();
    const host = hostname.toLowerCase();
    if (!(await this.organizations.removeCompanyDomain(organizationId, host))) {
      throw new NotFoundException("That domain isn't set up for your company.");
    }
    this.resolver.forget(host);
  }

  /** Sets or clears a dealer's domain in the data provider, then re-syncs so a dropped domain stops routing at once. */
  async setDealershipDomain(dealershipId: string, hostname: string | null): Promise<void> {
    const host = hostname === null ? null : this.requireClaimable(hostname);
    const dealership = await this.dealerships.findById(dealershipId);
    if (!dealership) throw new NotFoundException("Dealership not found.");
    const previous = dealership.customDomain?.trim().toLowerCase();
    await this.dealerships.setCustomDomain(dealership.id, host);
    await this.syncTenant(this.requireOrganizationId());
    if (previous && previous !== host) this.resolver.forget(previous);
  }

  /** Checks DNS now instead of waiting for the next sync; the domain goes live if the record is there. */
  async verify(hostname: string, dealershipId: string | null): Promise<CustomDomainView> {
    const organizationId = this.requireOrganizationId();
    const host = hostname.toLowerCase();
    if (dealershipId === null) {
      const [claims, routed] = await Promise.all([
        this.organizations.listCompanyDomainClaims(organizationId),
        this.organizations.listCustomDomains(organizationId),
      ]);
      if (!claims.includes(host) && !routed.some((d) => d.hostname === host && d.dealershipId === null)) {
        throw new NotFoundException("That domain isn't set up for your company.");
      }
    } else {
      const dealership = await this.dealerships.findById(dealershipId);
      if (dealership?.customDomain?.trim().toLowerCase() !== host) {
        throw new NotFoundException("That domain isn't set up for this dealership.");
      }
    }
    await this.claimIfVerified(organizationId, dealershipId, host);
    return this.view(organizationId, host, dealershipId, await this.organizations.listCustomDomains(organizationId));
  }

  /**
   * Mirrors one tenant's dealer URLs (Dealership__c.Url_Slug__c / Custom_Domain__c) into the host
   * registry the tenant resolver reads, and brings live every wanted domain — dealer or
   * company-wide — whose DNS now proves ownership. Runs inside that tenant's context.
   */
  async syncTenant(organizationId: string): Promise<void> {
    const entries: DealershipHostEntry[] = [];
    for (const dealership of await this.dealerships.findAll()) {
      if (!dealership.isActive) continue;
      const label = dealership.urlSlug?.trim().toLowerCase();
      if (!isAssignableSubdomainLabel(label)) {
        this.logger.warn(JSON.stringify({ event: "dealership_host_invalid", organizationId, dealershipId: dealership.id, kind: "label" }));
        continue;
      }
      const customDomain = dealership.customDomain?.trim().toLowerCase();
      const validDomain = isClaimableCustomDomain(customDomain);
      if (customDomain && !validDomain) {
        this.logger.warn(
          JSON.stringify({ event: "dealership_host_invalid", organizationId, dealershipId: dealership.id, kind: "custom_domain" }),
        );
      }
      entries.push({ dealershipId: dealership.id, label, customDomain: validDomain ? customDomain : undefined });
    }

    const { conflicts, unverifiedDomains } = await this.organizations.syncDealershipHosts(organizationId, entries);
    for (const conflict of conflicts) {
      this.logger.warn(JSON.stringify({ event: "dealership_host_conflict", organizationId, ...conflict }));
    }
    for (const { dealershipId, hostname } of unverifiedDomains) {
      await this.claimIfVerified(organizationId, dealershipId, hostname);
    }
    for (const hostname of await this.organizations.listCompanyDomainClaims(organizationId)) {
      await this.claimIfVerified(organizationId, null, hostname);
    }
  }

  private async claimIfVerified(organizationId: string, dealershipId: string | null, hostname: string): Promise<void> {
    if (!(await hasVerificationRecord(organizationId, hostname))) return;
    const outcome = await this.organizations.claimVerifiedHost(organizationId, dealershipId, hostname);
    this.resolver.forget(hostname);
    const event = outcome === "conflict" ? "custom_domain_conflict" : outcome === "transferred" ? "custom_domain_transferred" : "custom_domain_verified";
    const log = JSON.stringify({ event, organizationId, dealershipId, hostname });
    if (outcome === "claimed") this.logger.log(log);
    else this.logger.warn(log);
  }

  private view(organizationId: string, hostname: string, dealershipId: string | null, routed: TenantCustomDomain[]): CustomDomainView {
    const held = routed.find((d) => d.hostname === hostname);
    if (held && held.dealershipId === dealershipId) return { hostname, status: "live" };
    return { hostname, status: held ? "conflict" : "pending", verification: verificationRecordFor(organizationId, hostname) };
  }

  private requireClaimable(hostname: string): string {
    const host = hostname.trim().toLowerCase();
    if (!isClaimableCustomDomain(host)) {
      throw new BadRequestException(
        `Enter a domain you own, as a bare host name (e.g. drive.example.com) — not a ${env.tenantBaseDomain} address.`,
      );
    }
    return host;
  }

  private requireOrganizationId(): string {
    const organizationId = TenantContext.currentOrganizationId();
    if (!organizationId) throw new NotFoundException("Unknown organization.");
    return organizationId;
  }
}
