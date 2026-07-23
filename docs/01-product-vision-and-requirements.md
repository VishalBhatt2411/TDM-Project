# Test Drive Management Platform (TDM) — Product Vision & Requirements

**Phase 1 of 22** · Status: Draft for approval · Owner: Product & Architecture

---

## 1. Vision Statement

TDM is the system of record and system of engagement for the entire vehicle test-drive lifecycle — from a customer discovering a vehicle online to a sales representative closing an opportunity after a completed drive. It replaces fragmented, dealership-specific spreadsheets, phone-based scheduling, and CRM-only workflows with a unified, branded, multi-channel platform that feels as polished as a modern consumer product while giving dealership staff and executives enterprise-grade operational control.

Salesforce is the day-one data provider (existing dealership CRM data lives there today), but the platform is built so that **no frontend code and no business logic ever references Salesforce**. The system must be able to swap to PostgreSQL, Dynamics, SAP, or a microservice mesh later purely by writing a new adapter.

## 2. Problem Statement

Dealership groups today typically suffer from:

- Test drive booking scattered across phone calls, walk-ins, and disconnected web forms with no unified calendar or conflict detection.
- No real-time visibility for managers into vehicle utilization, sales rep workload, or funnel conversion (booking → drive → opportunity → sale).
- Customers have no self-service way to browse inventory, compare vehicles, book/reschedule/cancel drives, or track status — driving call-center load and abandonment.
- No standardized digital compliance trail (license verification, consent forms, e-signatures) — exposure to liability and audit risk.
- Sales reps operate without a mobile-friendly daily schedule, route plan, or structured drive/feedback capture, so opportunity creation is inconsistent and slow.
- Leadership lacks a single analytics view across branches, so resourcing (vehicle allocation, staffing) is reactive rather than data-driven.

## 3. Target Users (Summary — full personas in Phase 4)

| Persona | Core Need |
|---|---|
| **Prospective Customer** | Discover vehicles, book a test drive in under 2 minutes, know exactly what happens next |
| **Registered Customer** | Manage bookings, wishlist, feedback, purchase interest in one place |
| **Sales Representative** | A single daily queue: who to drive, when, where, what to capture, what happens after |
| **Branch Manager** | Real-time inventory/staff/booking control for their location |
| **Regional/Sales Manager** | Cross-branch KPIs, funnel, utilization, team performance |
| **System Administrator** | Users, roles, branches, config, templates, feature flags, audit, uptime |
| **Compliance/Security Officer** (implicit) | Audit trail, consent records, data protection evidence |

## 4. Goals & Success Metrics

**Business goals**
1. Reduce time-to-book a test drive from a phone call (~5–10 min) to a self-service flow (<2 min).
2. Increase test-drive → opportunity conversion by giving reps structured capture tools and managers visibility to coach the funnel.
3. Reduce no-shows via reminders, waitlists, and reschedule self-service.
4. Give leadership a live, cross-branch operational picture (utilization, conversion, staffing) without manual reporting.
5. Establish a compliant, auditable digital record for every drive (license check, consent, signature).

**Illustrative success metrics (to be finalized in Phase 2 with real stakeholder targets)**
- Self-service booking completion rate ≥ 85%.
- No-show rate reduced by ≥ 30% post-launch (reminders + waitlist).
- Booking → drive → feedback capture completion ≥ 95% (structured rep workflow).
- P95 page load < 2s; API P95 < 300ms (see NFRs).
- Zero Sev-1 security findings at launch (OWASP Top 10 clean).

## 5. Scope

### In scope — MVP (Phases 1–22 of this engagement)
- Customer portal: auth (incl. social login), profile, dashboard, booking history, wishlist, notifications, feedback.
- Vehicle discovery: search/filter, comparison, gallery, specs, EMI calculator, availability.
- Test drive lifecycle: book, reschedule, cancel, waitlist, conflict detection, home & dealership drive types, live status.
- Sales rep workspace: daily schedule, route plan, drive checklist, start/end drive, feedback capture, opportunity creation.
- Branch operations: inventory, allocation, staff management, booking management, utilization.
- Manager dashboards: KPIs, funnel, utilization, customer insights, team performance.
- Administration: users, roles, branches, configuration, notification templates, feature flags, audit logs, system monitoring.
- Enterprise capabilities: QR check-in, license verification, OTP, digital consent + e-signature, maps integration, WhatsApp/SMS/email/push notifications, calendar integration, AI recommendations/insights, i18n, PWA/offline, WCAG 2.2 AA, audit logging.
- Salesforce adapter as the sole initial data provider behind a provider-agnostic repository layer.

### Explicitly out of scope for this engagement (future roadmap candidates)
- Native mobile apps (PWA covers mobile-web; native iOS/Android is a follow-on).
- Payment/financing origination (EMI calculator is illustrative only, not a loan origination system).
- Third-party marketplace listing syndication (e.g., pushing inventory to external listing sites).
- Multi-tenant SaaS billing/subscription management (platform is built for a single dealership group initially, but architecture should not preclude it).
- Additional provider adapters beyond Salesforce (Postgres/Mongo/etc. adapters are stubbed as *architectural placeholders* per the monorepo structure, not fully implemented, unless requested).

## 6. Functional Requirements (by module)

Each module below will be elaborated into full user stories/acceptance criteria in Phase 2. High-level FRs:

**Customer Portal** — FR-1 registration/login/forgot-password/social login; FR-2 profile CRUD; FR-3 dashboard summarizing upcoming/past drives; FR-4 booking history with status; FR-5 notification center; FR-6 wishlist/saved vehicles; FR-7 post-drive feedback submission; FR-8 purchase-interest signal capture.

**Vehicle Discovery** — FR-9 keyword + faceted search; FR-10 advanced filters (price, body type, fuel, transmission, branch availability); FR-11 side-by-side comparison (up to 4 vehicles); FR-12 media gallery + video; FR-13 spec sheet; FR-14 accessories catalog; FR-15 pricing + EMI calculator; FR-16 real-time availability by branch/date.

**Test Drive Management** — FR-17 booking wizard with smart slot suggestion; FR-18 calendar view (customer + rep + branch); FR-19 home vs. dealership drive type; FR-20 reschedule/cancel with policy rules; FR-21 waitlist when fully booked; FR-22 conflict detection (vehicle, rep, slot double-booking); FR-23 live status tracking (requested → confirmed → in-progress → completed/no-show/cancelled).

**Sales Representative** — FR-24 daily schedule view; FR-25 assigned-drive list with customer detail; FR-26 route planning (map-based ordering); FR-27 pre-drive checklist (license verified, vehicle condition); FR-28 start/end drive with odometer/time capture; FR-29 structured feedback capture; FR-30 opportunity creation triggered from a completed drive.

**Branch Operations** — FR-31 branch dashboard; FR-32 vehicle inventory CRUD + status (available/in-drive/maintenance); FR-33 vehicle allocation across branches; FR-34 staff roster management; FR-35 booking management/override; FR-36 utilization monitoring (vehicle idle vs. in-use %).

**Manager Dashboard** — FR-37 cross-branch KPI tiles; FR-38 team performance leaderboard; FR-39 conversion funnel (booking→drive→opportunity→sale); FR-40 booking analytics (volume, source, trend); FR-41 vehicle utilization analytics; FR-42 customer insight segments.

**Administration** — FR-43 user management; FR-44 role/permission management (RBAC); FR-45 branch management; FR-46 system configuration; FR-47 notification template editor; FR-48 feature flag management; FR-49 audit log viewer; FR-50 system health/monitoring view.

**Cross-cutting enterprise features** — FR-51 QR check-in at branch; FR-52 driving license verification (capture + validation workflow); FR-53 OTP verification (phone/email); FR-54 digital consent forms; FR-55 e-signature capture; FR-56 Google Maps integration (branch locator, route); FR-57 WhatsApp/SMS/email/push notification delivery; FR-58 calendar integration (Google/Outlook .ics); FR-59 AI vehicle recommendations; FR-60 AI booking-time suggestions; FR-61 AI customer insight summaries; FR-62 multi-language UI; FR-63 offline-tolerant PWA shell; FR-64 comprehensive audit trail across all write operations.

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | P95 API response < 300ms for reads, < 800ms for writes involving Salesforce calls; P95 page interactive < 2s on 4G |
| **Scalability** | Stateless API tier, horizontally scalable; adapter layer must tolerate Salesforce API rate limits via caching/queuing |
| **Availability** | 99.9% target for customer-facing portal; graceful degradation if Salesforce is unreachable (read from cache, queue writes) |
| **Security** | OWASP Top 10 mitigated; JWT + refresh tokens; RBAC enforced server-side on every endpoint; encryption in transit (TLS) and at rest; audit logging of all sensitive actions |
| **Accessibility** | WCAG 2.2 AA across customer and internal apps |
| **Internationalization** | UI text externalized for multi-language from day one, even if only one locale ships initially |
| **Observability** | Structured logging, request tracing, health checks, error budgets surfaced in admin monitoring view |
| **Compliance/Privacy** | PII handling aligned to data-protection norms (minimization, retention policy hooks, consent capture) |
| **Maintainability** | Strict TypeScript, enforced lint/format, layered architecture with provider-agnostic domain layer, ≥ 80% coverage on domain/application layers |
| **Portability** | Zero Salesforce leakage into frontend or domain layer; swapping providers requires only a new adapter package |
| **Browser/Device support** | Latest 2 versions of Chrome/Edge/Safari/Firefox; responsive from 360px to 4K; installable PWA |

## 8. Assumptions & Constraints

- Salesforce org (edition, existing objects/fields, API limits) is not yet specified — Phase 2 will need to confirm object model, licensing (API call limits), and whether we're building against a sandbox or production org.
- No existing design system/brand guidelines provided yet — Phase 13 (UI/UX Design System) will need either brand input from the user or a proposed neutral, premium default (Tesla/BMW-tier aesthetic) pending approval.
- Deployment target (cloud provider, on-prem, existing infra) is not yet specified — will be confirmed before Phase 21 (Deployment & CI/CD).
- This is a single-dealership-group deployment; multi-tenant SaaS concerns are noted as future-proofing, not built out now.
- AI features (recommendations/insights) will initially use rule-based/heuristic logic with a clean interface for a future LLM/ML provider swap, unless the user confirms a specific AI provider budget/integration now.

## 8a. Decisions Confirmed (post-review)

- **Salesforce**: A fresh Dev Edition org will be used. Since it is empty, **we design the domain model first and define our own custom Salesforce objects/fields to match it** (rather than reverse-engineering an existing schema). This gives the adapter layer a clean, purpose-built mapping instead of compromising the domain model around legacy objects.
- **Design system**: No existing brand — the team will propose an original, premium design system (Phase 13), neutral enough to reskin with a real dealership brand later.
- **AI features**: Heuristic/rule-based `RecommendationEngine` and `InsightEngine` implementations now, built behind interfaces that allow a real LLM provider to be swapped in later without touching calling code.
- **MVP scope**: Approved as written in §5.

## 9. Key Architectural Decisions (preview — full detail in later phases)

1. **Hexagonal/Clean Architecture**: Presentation → Application → Domain → Repository Interfaces → Provider Adapters → Salesforce Adapter. Domain layer has zero Salesforce imports.
2. **Monorepo** with `apps/web`, `apps/api`, shared `packages/*`, and `integrations/*` adapters — enables strict boundary enforcement via package boundaries/lint rules, not just convention.
3. **NestJS** for the API (DI, modular structure, first-class OpenAPI, guards for RBAC) — a better fit than a minimal Express app for the "repository pattern + DDD + provider adapter" requirement.
4. **React + Vite + TypeScript + Tailwind + shadcn/ui** for a fast, accessible, themeable component base rather than a heavier meta-framework, since this is an API-driven SPA/PWA, not an SSR content site.

## 10. Risks & Trade-offs

| Risk | Impact | Mitigation |
|---|---|---|
| Salesforce object model/limits unknown | Adapter design could need rework | Treat Phase 2/12 as a checkpoint to confirm real SF schema before writing the adapter; design repository interfaces against domain models first so rework stays isolated to the adapter package |
| Scope is extremely large (22 phases, dozens of modules) | Risk of shallow, unfinished features if rushed | Strict phase gating with approval checkpoints (per workflow); recommend building a vertical slice (auth + vehicle discovery + booking) end-to-end before breadth expansion |
| "No mock/placeholder/TODO" constraint vs. unknown Salesforce credentials | Backend can't hit a real SF org without credentials | Will need real (or sandbox) Salesforce credentials/org access before the adapter can be functionally complete — flagged now so it isn't a late surprise |
| AI features (recommendations/insights) without a specified model provider | Could be built as either heuristic-only or require external API keys/cost | Default to a clean `RecommendationEngine` interface with a heuristic implementation now; swap in an LLM provider later behind the same interface if the user wants that now |
| Enormous feature surface for one engagement | Quality risk if breadth trumps depth | Recommend explicit MVP-first ordering (see §5 scope) and treat "nice-to-have" enterprise features (e.g., offline PWA, multi-language) as stubbed-but-real (functional, minimal) rather than deep in v1 |

## 11. Recommendations Before Proceeding to Phase 2

1. Confirm real Salesforce org details (edition, key objects like Lead/Contact/Opportunity/Asset, or whether we design new custom objects) — this materially shapes the domain model in Phase 5 and the adapter in Phase 12.
2. Confirm whether there's an existing brand/design language to follow, or if we should propose an original premium design system (Phase 13).
3. Confirm deployment target (cloud provider / Docker-only / on-prem) to shape Phase 21.
4. Approve the MVP scope boundary in §5 so later phases build breadth in the right order.
5. Decide on AI feature depth: heuristic-based now vs. wiring a real LLM provider (e.g., Claude via the Anthropic API) for recommendations/insights.

---

**This concludes Phase 1.** Per the engagement workflow, I'm stopping here for your review before moving to Phase 2 (Functional & Non-Functional Requirements — detailed user stories and acceptance criteria) and Phase 3 (Business Capability Map).
