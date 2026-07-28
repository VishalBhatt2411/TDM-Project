# Salesforce Automation Audit

Full inventory of every Salesforce-side and Salesforce-adjacent automation in the TDM platform, audited against the org metadata in `integrations/salesforce/mdapi/` and the Node services that call into it. Bottom line: **the org itself is deliberately automation-light.** There is exactly one native Salesforce automation surface (a REST-exposed Apex email service) plus a read-only reporting dashboard. All scheduling, business-rule, and workflow logic lives in the NestJS backend (`apps/api`), not in native Salesforce constructs — none of Flows, Apex Triggers, Validation/Workflow Rules, Assignment/Auto-response Rules, Approval Processes, Platform Events, or Scheduled/Batch/Queueable Apex exist in this deployment.

## Summary table

| Automation | Type | Status |
|---|---|---|
| `BookingEmailRestResource.cls` / `BookingEmailService.cls` | Apex REST email service | Working |
| `TDMDashboardController.cls` | Apex (Aura-enabled, read-only) | Working |
| `reminder.scheduler.ts` (Node cron) | Booking reminder emails | Working |
| `followup.scheduler.ts` (Node cron) | Post-drive follow-up emails | Working |
| `tdmDashboard` / `tdmKpiTile` LWC | Lightning dashboard UI | Working |
| `TDM_Full_Access` permission set | Integration-user grant | Working |
| Flows | — | **Not implemented** |
| Apex Triggers | — | **Not implemented** |
| Validation / Workflow Rules | — | **Not implemented** |
| Assignment / Auto-response Rules | — | **Not implemented** |
| Approval Processes | — | **Not implemented** |
| Platform Events | — | **Not implemented** |
| Scheduled / Batch / Queueable Apex | — | **Not implemented** |
| Classic Email Templates / Alerts | — | **Not implemented** (email is built entirely in Node) |

---

## 1. `BookingEmailRestResource.cls` + `BookingEmailService.cls`

- **Purpose**: the org's only outbound-email automation. Every transactional email the platform sends (booking confirmation, cancellation, reschedule, reminder, follow-up, survey request, account-access/magic-link, password-setup) is built as HTML in Node (`apps/api/src/notifications/email-templates.ts`) and POSTed to this Apex REST endpoint, which sends it via `Messaging.sendEmail`.
- **Trigger/Event**: an authenticated HTTP POST to `/services/apexrest/tdm/sendEmail`, invoked by `SalesforceEmailSender.send()` (`apps/api/src/notifications/email-sender.ts`) via jsforce.
- **Inputs**: `{ to, subject, html }`.
- **Outputs**: Salesforce-delivered email; no return payload consumed by the caller beyond success/failure.
- **Status**: Working, with unit test coverage (`BookingEmailRestResourceTest.cls`, `BookingEmailServiceTest.cls`).
- **Dependencies**: the integration user's Salesforce session (see §"Top production risk" below); `TDM_Full_Access` permission set grants class access.
- **Gaps/Recommendations**: failures are caught and logged in Node (`email-sender.ts`, try/catch, no retry/queue) — acceptable for non-critical notification paths (matches the "never hard-crash on an email delivery hiccup" design intent), but there's no dead-letter queue or alerting if Salesforce email sending silently degrades (e.g., daily Salesforce email limits exhausted). Recommend surfacing a metric/alert on repeated send failures.

## 2. `TDMDashboardController.cls`

- **Purpose**: backs the `tdmDashboard` LWC — KPIs, status breakdown, upcoming bookings, sales-rep leaderboard for managers/reps.
- **Trigger/Event**: `@AuraEnabled(cacheable=true)` methods (`getKpis`, `getStatusBreakdown`, `getUpcomingBookings`, `getRepLeaderboard`) invoked by the LWC on load.
- **Inputs**: none (implicit — queries current org data).
- **Outputs**: aggregated SOQL results over `Booking__c`, `Drive_Feedback__c.NPS_Score__c`, `Sales_Rep__c`.
- **Status**: Working, fully read-only (no DML) — writes to booking/rep data happen exclusively through the Node API, by design (comment in the controller states this explicitly).
- **Dependencies**: `TDM_Full_Access` permission set (class + field-level access); `TDM_Test_Drive_Management` Lightning app for navigation.
- **Gaps/Recommendations**: none functionally — this is intentionally a passive reporting surface. If usage grows, consider whether `cacheable=true` SOQL needs selective indexes on `Booking__c.Scheduled_Start__c`/`Status__c` for query performance at scale.

## 3. Node-side schedulers (the platform's real "automation" layer)

- **`reminder.scheduler.ts`**: `@Cron("*/15 * * * *")`. Scans `Confirmed`/`Requested` bookings for 24h/2h/day-of reminder windows, dedupes via Postgres `ReminderLog` (so a re-scan of the same window never double-sends), calls `NotificationsService.sendReminder` → Salesforce email REST service.
- **`followup.scheduler.ts`**: `@Cron("0 10 * * *")` daily. Sends 3/7/14-day post-drive follow-ups for completed bookings with no resulting Opportunity, dedupes via Postgres `FollowUpLog`.
- **Status**: Both fully implemented, not stubs.
- **Dependencies**: the NestJS process must be running continuously (`@nestjs/schedule`); Postgres for dedup logs; the Salesforce connection for the actual send.
- **Gaps/Recommendations**: there is no native Salesforce fallback if the Node process is down — reminders/follow-ups simply don't fire until it's back up (no missed-window catch-up beyond the next 15-minute/daily scan, which does still catch anything still in-window). For a production deployment, consider either (a) a process-health alert on the Node scheduler, or (b) a Scheduled Apex safety net that fires a subset of critical reminders independently, as defense in depth.

## 4. `tdmDashboard` / `tdmKpiTile` (LWC)

- **Purpose**: presentation layer for the above controller. `tdmKpiTile` is a pure presentational child (no data access).
- **Status**: Working, read-only, no write-back to Salesforce from the dashboard.

## 5. `TDM_Full_Access` permission set / `TDM_Test_Drive_Management` app

- **Purpose**: grants the backend's integration user full CRUD + `modifyAllRecords`/`viewAllRecords` on all custom objects, field-level access on ~90 fields, and class access to `TDMDashboardController`. The Lightning app bundles the dashboard + object tabs for internal Salesforce users.
- **Status**: Working, purely configuration (no logic).

## 6. Confirmed absent (all searched for explicitly, zero matches repo-wide)

| Category | Finding |
|---|---|
| Flows | No `flows/` folder, no `.flow-meta.xml` anywhere |
| Apex Triggers | No `triggers/` folder, no `trigger ` keyword in any `.cls` |
| Validation Rules | Zero `validationRule` blocks across all 12 `.object` metadata files |
| Workflow Rules / Field Updates | Zero `workflowRule`/`fieldUpdates` blocks |
| Assignment Rules | Not found |
| Auto-response Rules | Not found |
| Approval Processes | Not found |
| Platform Events | No `__e`-suffixed objects, no references |
| Scheduled Apex | No `implements Schedulable` |
| Queueable Apex | No `implements Queueable` |
| Batch Apex | No `implements Batchable` |
| Classic Email Templates / Email Alerts | No templates folder; all email HTML is authored in Node (`email-templates.ts`) and sent via the REST service in §1 |

**Recommendation on these gaps**: since Salesforce is a swappable data provider (per architectural mandate), pushing business-rule enforcement (e.g., required-field/validation logic) into native Salesforce Validation Rules would create a second source of truth that has to stay in sync with the Node domain layer's own validation (`packages/domain`). Current design — validation lives entirely in Node, Salesforce is a plain data store — is consistent with that mandate and is **not** a gap so much as a deliberate trade-off; call this out explicitly if a future reviewer proposes adding Salesforce-native validation rules, since it would duplicate logic the domain layer already owns.

## Top production-readiness risk (affects every automation above)

All Salesforce access — including every automation in this document — goes through `SalesforceConnectionProvider` (`integrations/salesforce/src/connection.ts`), which shells out to an already-authenticated `sf` CLI session to mint access tokens. This has **no interactive session to rely on in a server deployment**. This is already flagged in [docs/07-overview-and-setup-guide.md](07-overview-and-setup-guide.md) as the top hosting prerequisite — replace with a Connected App JWT Bearer flow before any of these automations can run unattended in production. Repeating it here because it is the single point of failure for every automation in this audit, not just the booking flow.
