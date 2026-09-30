import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditLogRepository,
  BookingSchedule,
  BookingScheduleRepository,
  ResolvedBookingSchedule,
  WeeklyHours,
  parseBookingSchedule,
  resolveBookingSchedule,
} from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY, BOOKING_SCHEDULE_REPOSITORY } from "../infrastructure/tokens";
import { BookingScheduleService } from "../config/booking-schedule.service";
import { TenantContext } from "../tenancy/tenant-context";

export interface BookingScheduleEditorView {
  own: BookingSchedule;
  /** The company layer when editing a dealership; null company-wide. */
  inherited: BookingSchedule | null;
  /** What opening hours fall back to when no layer sets them — the data provider org's default business hours. */
  providerHours: WeeklyHours;
  /** What each field this scope leaves unset resolves to — the layers below it. */
  fallback: ResolvedBookingSchedule;
  /** What this scope actually uses once every layer is applied. */
  effective: ResolvedBookingSchedule;
}

const SCHEDULE_KEYS: readonly (keyof BookingSchedule)[] = ["slotMinutes", "weeklyHours", "breaks"];

/** Edits one scope's booking schedule (a dealership's, or the company-wide one) — the scope is already verified by ConfigScopeResolver. */
@Injectable()
export class AdminBookingScheduleService {
  constructor(
    @Inject(BOOKING_SCHEDULE_REPOSITORY) private readonly schedules: BookingScheduleRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly scheduleService: BookingScheduleService,
  ) {}

  async view(dealershipId: string | undefined): Promise<BookingScheduleEditorView> {
    const [own, inherited, providerHours] = await Promise.all([
      this.findLayer(dealershipId),
      dealershipId ? this.findLayer(undefined) : Promise.resolve(null),
      this.schedules.findProviderHours(),
    ]);
    const below = inherited ? [inherited] : [];
    return {
      own,
      inherited,
      providerHours,
      fallback: resolveBookingSchedule(below, providerHours),
      effective: resolveBookingSchedule([own, ...below], providerHours),
    };
  }

  /** Replaces the whole schedule at this scope — an omitted field is cleared and inherits again. */
  async save(raw: unknown, dealershipId: string | undefined, actorId: string): Promise<BookingScheduleEditorView> {
    const schedule = parseBookingSchedule(raw);
    const before = await this.findLayer(dealershipId);
    await this.schedules.saveLayer(schedule, dealershipId);
    this.scheduleService.invalidate(TenantContext.currentOrganizationId()!, dealershipId);

    await this.auditLog.append({
      actorId,
      action: "BOOKING_SCHEDULE_UPDATED",
      entityType: "BookingSchedule",
      entityId: dealershipId ?? "company",
      metadata: {
        dealershipId: dealershipId ?? null,
        changedFields: SCHEDULE_KEYS.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(schedule[key])),
      },
    });
    return this.view(dealershipId);
  }

  private async findLayer(dealershipId: string | undefined): Promise<BookingSchedule> {
    const layer = await this.schedules.findLayer(dealershipId);
    if (!layer && dealershipId) throw new NotFoundException("Dealership not found.");
    return layer ?? {};
  }
}
