# User Personas & Journeys

**Phase 4** · Status: Draft for approval

## Persona: Priya — Prospective Customer
- **Goals**: Find the right vehicle quickly, book a test drive without calling anyone, know exactly what to bring/expect.
- **Pain points today**: Dealership sites are brochure-ware; booking means a phone call during business hours; no visibility once booked.
- **Tech comfort**: High — expects an Amazon/Tesla-grade self-service flow on mobile.

**Key journey — Discover to Booked**
1. Lands on vehicle discovery, filters by body type/budget.
2. Compares 2–3 shortlisted vehicles side by side.
3. Opens a vehicle detail page, checks EMI estimate and branch availability.
4. Clicks "Book a Test Drive," picks home or dealership drive, picks a smart-suggested slot.
5. **Registers/logs in — registration is required before booking is confirmed.** Decision: no guest booking. Registration captures verified email + phone, which are required to create the corresponding Lead/Opportunity in Salesforce once a drive results in sales interest.
6. Completes OTP verification, uploads/verifies driving license, accepts digital consent.
7. Receives confirmation via email/SMS/WhatsApp with calendar invite.
8. Tracks live status on the day of the drive; can reschedule/cancel up to a policy cutoff.

## Persona: Priya (returning) — Registered Customer
- **Goals**: Manage everything from one dashboard; not re-enter info every time.
- **Key journey — Post-drive**: Receives feedback prompt → submits rating/comments → indicates purchase interest → sees it reflected as "opportunity in progress" status on their dashboard.

## Persona: Sam — Sales Representative
- **Goals**: Walk in each morning, see exactly who to drive today, in what order, with everything needed already prepared.
- **Pain points today**: Schedule lives in someone else's spreadsheet; customer/license/consent info isn't in hand at drive time; opportunity creation is a separate manual CRM step done later (or forgotten).

**Key journey — Daily drive execution**
1. Opens rep dashboard, sees today's schedule ordered by time, with a suggested route.
2. Taps into a booking, sees customer + vehicle + special notes.
3. At drive time, scans customer's QR check-in (or manually confirms), verifies license status.
4. Starts drive (captures odometer/time), completes drive, ends it.
5. Fills structured feedback (customer sentiment, objections, interest level).
6. If interest is high, creates an opportunity in one click — flows to Salesforce as a real Opportunity via the adapter.

## Persona: Bianca — Branch Manager
- **Goals**: Know today's vehicle availability, staffing, and booking load at a glance; reallocate vehicles between branches when one is short.
- **Key journey**: Opens branch dashboard → sees inventory status (available/in-drive/maintenance) → sees today's bookings and any conflicts → requests a vehicle transfer from a sister branch → adjusts staff roster for tomorrow.

## Persona: Marcus — Regional/Sales Manager
- **Goals**: Cross-branch KPI visibility, identify underperforming branches/reps, spot vehicle utilization gaps.
- **Key journey**: Opens manager dashboard → reviews conversion funnel across branches → drills into a branch with low conversion → checks rep performance → checks vehicle utilization to see if inventory mix is the issue → exports/report to leadership.

## Persona: Aisha — System Administrator
- **Goals**: Onboard new branches/staff quickly, keep RBAC correct, prove compliance via audit logs, roll out features safely.
- **Key journey**: Creates a new branch → assigns a branch manager role → configures notification templates for that branch's locale → enables a new feature flag for a pilot branch only → reviews audit log after a support ticket about a disputed booking change.

## Cross-cutting journey — Compliance trail
For every booked and completed drive, the platform must produce an auditable record: identity verification (OTP), license verification, signed consent, drive start/end timestamps, and rep feedback — queryable by an admin/compliance officer without needing to reconstruct it from multiple systems.

---
This completes the discovery/requirements arc (Phases 2–4). Combined with [Phase 1](01-product-vision-and-requirements.md) and the [Business Capability Map](02-business-capability-map.md), we now have enough shared understanding to move into technical design: Domain Model, System Context, Container/Component diagrams, Database design, and API contracts (Phases 5–9).
