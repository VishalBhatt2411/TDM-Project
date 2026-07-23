# Business Capability Map

**Phase 3** · Status: Draft for approval

A capability map describes *what* the business does, independent of how it's implemented today (Salesforce) or tomorrow (any provider). Each L1 capability groups the L2 capabilities that later become bounded contexts in the domain model (Phase 5) and module boundaries in the frontend/backend (Phases 10–11).

## L1 — Customer Engagement
- L2: Identity & Access (registration, login, social login, password recovery, session mgmt)
- L2: Customer Profile Management
- L2: Notification Preferences & Delivery (email/SMS/WhatsApp/push)
- L2: Wishlist & Saved Vehicles
- L2: Feedback & Voice of Customer

## L1 — Vehicle Discovery
- L2: Catalog & Search
- L2: Comparison
- L2: Media & Specification Presentation
- L2: Pricing & Financing Estimation (EMI calculator)
- L2: Availability Lookup (cross-branch)

## L1 — Test Drive Operations
- L2: Booking & Scheduling
- L2: Slot & Conflict Management
- L2: Waitlist Management
- L2: Drive Execution (check-in, start/end, checklist)
- L2: Compliance Capture (license verification, consent, e-signature, OTP)
- L2: Status Tracking & Notifications

## L1 — Sales Enablement
- L2: Rep Daily Operations (schedule, route planning)
- L2: Customer Interaction Capture (feedback, notes)
- L2: Opportunity Creation & Handoff to CRM pipeline

## L1 — Branch Operations
- L2: Inventory Management
- L2: Vehicle Allocation Across Branches
- L2: Staff & Roster Management
- L2: Branch-level Booking Oversight
- L2: Utilization Monitoring

## L1 — Analytics & Insights
- L2: Funnel & Conversion Analytics
- L2: Team & Rep Performance
- L2: Vehicle Utilization Analytics
- L2: Customer Segmentation/Insights
- L2: AI-Assisted Recommendations & Suggestions

## L1 — Platform Administration
- L2: User & Role Management (RBAC)
- L2: Branch & Org Configuration
- L2: Notification Template Management
- L2: Feature Flag Management
- L2: Audit Logging
- L2: System Health & Monitoring

## L1 — Integration & Interoperability
- L2: Provider Adapter Framework (repository interfaces + adapters)
- L2: Salesforce Adapter (initial provider)
- L2: Maps/Geolocation Integration
- L2: Calendar Integration (Google/Outlook)
- L2: Messaging Gateway Integration (SMS/WhatsApp/Email/Push)

## Capability → Bounded Context mapping (preview for Phase 5)

| L1 Capability | Candidate Domain Aggregate(s) |
|---|---|
| Customer Engagement | `Customer`, `Notification` |
| Vehicle Discovery | `Vehicle`, `PricingQuote` |
| Test Drive Operations | `Booking`, `ComplianceRecord` |
| Sales Enablement | `SalesRepresentative`, `Opportunity` |
| Branch Operations | `Branch`, `InventoryAllocation` |
| Analytics & Insights | (read models / projections, not a transactional aggregate) |
| Platform Administration | `User`, `Role`, `AuditLogEntry`, `FeatureFlag` |
| Integration & Interoperability | (infrastructure layer, not a domain aggregate) |

This mapping keeps the domain model business-shaped rather than Salesforce-shaped — every aggregate here is a plain domain concept with no Salesforce object names attached.
