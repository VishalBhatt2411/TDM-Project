import { Inject, Injectable } from "@nestjs/common";
import type { StaffAssignmentRepository } from "@tdm/domain";
import type { StaffUserRepository } from "@tdm/postgres-adapter";
import { STAFF_ASSIGNMENT_REPOSITORY, STAFF_USER_REPOSITORY } from "../infrastructure/tokens";
import { StaffAccess } from "./staff-access";
import type { AuthenticatedStaff } from "./staff-auth.guard";

/** Bounds how long a revoked assignment keeps working on another API instance, which this cache can't invalidate. */
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 1000;

interface CacheEntry {
  access: StaffAccess | null;
  salesforceUserId?: string;
  expiresAt: number;
}

/**
 * Resolves a session's access from the data provider's staff assignments. Resolved on every
 * authorization (never carried in the JWT) so a revoked assignment takes effect within the
 * cache TTL — immediately on this instance, since assignment changes made through the console
 * invalidate it. Must run inside the session's tenant context.
 */
@Injectable()
export class StaffAccessService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Inject(STAFF_USER_REPOSITORY) private readonly staffUsers: StaffUserRepository,
    @Inject(STAFF_ASSIGNMENT_REPOSITORY) private readonly assignments: StaffAssignmentRepository,
  ) {}

  /** Null when the staff user is unknown, belongs to another tenant, or holds no active assignment. */
  async resolve(staff: AuthenticatedStaff, options: { fresh?: boolean } = {}): Promise<StaffAccess | null> {
    const key = `${staff.organizationId}:${staff.staffUserId}`;
    const cached = this.cache.get(key);
    if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.access;

    const staffUser = await this.staffUsers.findById(staff.staffUserId);
    let access: StaffAccess | null = null;
    if (staffUser && staffUser.organizationId === staff.organizationId) {
      const assignments = await this.assignments.findActiveByUser(staffUser.salesforceUserId);
      access = assignments.length ? new StaffAccess(staffUser, assignments) : null;
    }
    this.store(key, { access, salesforceUserId: staffUser?.salesforceUserId, expiresAt: Date.now() + CACHE_TTL_MS });
    return access;
  }

  /** Drops cached access for a provider user after their assignments change. */
  invalidate(organizationId: string, salesforceUserId: string): void {
    const prefix = `${organizationId}:`;
    for (const [key, entry] of this.cache) {
      if (key.startsWith(prefix) && entry.salesforceUserId === salesforceUserId) this.cache.delete(key);
    }
  }

  private store(key: string, entry: CacheEntry): void {
    this.cache.delete(key);
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      // Map iteration is insertion-ordered, so the first key is the oldest entry.
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, entry);
  }
}
