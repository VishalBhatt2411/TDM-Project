import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditLogRepository,
  ProviderRegionalDefaults,
  RegionalSettings,
  RegionalSettingsRepository,
  ResolvedRegionalSettings,
  parseRegionalSettings,
  resolveRegionalSettings,
} from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY, REGIONAL_SETTINGS_REPOSITORY } from "../infrastructure/tokens";
import { RegionalSettingsService } from "../config/regional-settings.service";
import { TenantContext } from "../tenancy/tenant-context";

export interface RegionalSettingsEditorView {
  own: RegionalSettings;
  /** The company layer when editing a dealership; null company-wide. */
  inherited: RegionalSettings | null;
  /** What any field still unset falls back to — the data provider org's own settings. */
  providerDefaults: ProviderRegionalDefaults;
  /** What this scope actually uses once every layer is applied. */
  effective: ResolvedRegionalSettings;
}

const REGIONAL_KEYS: readonly (keyof RegionalSettings)[] = ["locale", "timeZone", "phoneCountryCode"];

/** Edits one scope's regional settings (a dealership's, or the company-wide one) — the scope is already verified by ConfigScopeResolver. */
@Injectable()
export class AdminRegionalSettingsService {
  constructor(
    @Inject(REGIONAL_SETTINGS_REPOSITORY) private readonly regional: RegionalSettingsRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly regionalService: RegionalSettingsService,
  ) {}

  async view(dealershipId: string | undefined): Promise<RegionalSettingsEditorView> {
    const [own, inherited, providerDefaults] = await Promise.all([
      this.findLayer(dealershipId),
      dealershipId ? this.findLayer(undefined) : Promise.resolve(null),
      this.regional.findProviderDefaults(),
    ]);
    const layers = inherited ? [own, inherited] : [own];
    return { own, inherited, providerDefaults, effective: resolveRegionalSettings(layers, providerDefaults) };
  }

  /** Replaces the whole layer at this scope — an omitted field is cleared and inherits again. */
  async save(raw: unknown, dealershipId: string | undefined, actorId: string): Promise<RegionalSettingsEditorView> {
    const settings = parseRegionalSettings(raw);
    const before = await this.findLayer(dealershipId);
    await this.regional.saveLayer(settings, dealershipId);
    this.regionalService.invalidate(TenantContext.currentOrganizationId()!, dealershipId);

    await this.auditLog.append({
      actorId,
      action: "REGIONAL_SETTINGS_UPDATED",
      entityType: "RegionalSettings",
      entityId: dealershipId ?? "company",
      metadata: {
        dealershipId: dealershipId ?? null,
        changedFields: REGIONAL_KEYS.filter((key) => before[key] !== settings[key]),
      },
    });
    return this.view(dealershipId);
  }

  private async findLayer(dealershipId: string | undefined): Promise<RegionalSettings> {
    const layer = await this.regional.findLayer(dealershipId);
    if (!layer && dealershipId) throw new NotFoundException("Dealership not found.");
    return layer ?? {};
  }
}
