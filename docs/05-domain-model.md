# Domain Model

**Phase 5** · Status: Draft for approval

This is the **provider-agnostic** domain layer referenced throughout Phase 1. Nothing here mentions Salesforce. The [Salesforce schema](04-salesforce-schema-design.md) already deployed is one *persistence mapping* of this model — the Salesforce Adapter (Phase 12) is responsible for translating between the two. If we ever add a Postgres or Dynamics adapter, this file does not change.

## Aggregates

### Customer (aggregate root)
| Field | Type | Notes |
|---|---|---|
| id | CustomerId (UUID) | Platform-internal identity — maps to `Contact.Portal_User_Id__c` in the SF adapter |
| name | PersonName | first/last |
| email | Email (value object, validated) | unique, verified at registration |
| phone | PhoneNumber (value object) | unique, verified via OTP |
| preferredLanguage | LanguageCode | default `en` |
| marketingOptIn | boolean | |
| license | DrivingLicense \| null | number, verified flag, expiry — captured before a drive, not necessarily at registration |
| createdAt | DateTime | |

**Invariant:** a Customer must have a verified email and phone before any Booking can be created for them (registration-first policy — see [Phase 3/4](03-personas-and-journeys.md)).

### Vehicle (aggregate root)
Fields mirror `Vehicle__c`: make, model, trim, year, VIN, bodyType, fuelType, transmission, color, price (Money), odometer, status (`Available|Reserved|InDrive|Maintenance|Sold`), branchId, media (gallery/video/primary image), specSheet, accessories, isFeatured.

**Invariant:** a Vehicle can only transition to `Reserved`/`InDrive` if it has no other overlapping `Booking` in `Confirmed|InProgress` state (enforced by the `BookingConflictChecker` domain service, not by the persistence layer).

### Branch (aggregate root)
Fields mirror `Branch__c`: name, address (value object), geo (lat/long), phone, email, operatingHours, managerName, isActive.

### SalesRepresentative (aggregate root)
Fields mirror `Sales_Rep__c`: name, email, phone, branchId, isActive, maxDailyBookings, linkedPlatformUserId.

### Booking (aggregate root — the core transactional aggregate)
| Field | Type |
|---|---|
| id | BookingId |
| customerId | CustomerId |
| vehicleId | VehicleId |
| branchId | BranchId |
| salesRepId | SalesRepId \| null |
| driveType | `Dealership \| Home` |
| slot | TimeSlot (value object: start, end) |
| status | `Requested\|Confirmed\|Waitlisted\|InProgress\|Completed\|Cancelled\|NoShow` |
| homeAddress | Address \| null |
| checkIn | CheckIn value object \| null (method, timestamp) |
| actualDrive | ActualDriveWindow \| null (start, end, odometerStart, odometerEnd) |
| cancellationReason | string \| null |
| rescheduledFromBookingId | BookingId \| null |
| waitlistPosition | number \| null |

**Invariants (enforced in the application/domain layer, not just DB constraints):**
- A `Booking` cannot move to `Confirmed` if `BookingConflictChecker` finds another `Confirmed`/`InProgress` booking for the same vehicle with an overlapping `TimeSlot`.
- A `Booking` can only be `Cancelled` or rescheduled up to a configurable policy cutoff (e.g., 2 hours before `slot.start`) — enforced by a `CancellationPolicy` domain service.
- Waitlisted bookings are promoted in FIFO order by `WaitlistPromotionService` when a slot frees up.

**Child entities (not separate aggregates — always accessed through Booking):**
- `ComplianceRecord`: otpVerified, license snapshot, consentAccepted, consentDocumentUrl, signatureUrl, signedAt.
- `DriveFeedback`: customerRating, customerComments, repNotes, interestLevel (`Low|Medium|High`), objectionsRaised, submittedBy, purchaseInterest.

### WishlistItem, VehicleAllocation
Simple aggregates mirroring their SF counterparts 1:1 — customerId+vehicleId, and vehicleId+fromBranchId+toBranchId+status respectively.

### SalesOpportunity (aggregate root — represents the funnel outcome, not the CRM object)
| Field | Type |
|---|---|
| id | OpportunityId |
| bookingId | BookingId |
| customerId | CustomerId |
| vehicleId | VehicleId |
| stage | `Identified\|Pursuing\|Won\|Lost` |
| createdAt | DateTime |

This is what the frontend and application layer work with. The Salesforce Adapter is responsible for deciding *how* this becomes a `Lead`→convert→`Opportunity` chain in Salesforce (see [schema doc](04-salesforce-schema-design.md)) — that translation is entirely hidden behind `SalesOpportunityRepository`.

## Value Objects
`Email`, `PhoneNumber`, `PersonName`, `Address`, `GeoCoordinates`, `Money`, `TimeSlot`, `DrivingLicense`, `CheckIn`, `ActualDriveWindow`. All are immutable and self-validating (e.g., `Email` rejects malformed input at construction, `TimeSlot` rejects `end <= start`).

## Domain Events
`CustomerRegistered`, `BookingRequested`, `BookingConfirmed`, `BookingWaitlisted`, `BookingPromotedFromWaitlist`, `BookingCancelled`, `BookingRescheduled`, `DriveCheckedIn`, `DriveStarted`, `DriveCompleted`, `ComplianceCaptured`, `FeedbackSubmitted`, `OpportunityCreated`, `VehicleAllocationRequested`, `VehicleAllocationCompleted`.

These are the seams notifications (Phase-1 FR-57/58) and analytics projections hang off — e.g., the notification module subscribes to `BookingConfirmed` to send email/SMS/WhatsApp, without the Booking domain logic knowing notifications exist.

## Repository Interfaces (Ports)
One per aggregate root: `CustomerRepository`, `VehicleRepository`, `BranchRepository`, `SalesRepRepository`, `BookingRepository`, `WishlistRepository`, `VehicleAllocationRepository`, `SalesOpportunityRepository`. Each defines only domain-shaped methods (e.g., `BookingRepository.findOverlapping(vehicleId, slot)`, not `querySOQL(...)`). The Salesforce Adapter (Phase 12) implements all of them against the schema in `04-salesforce-schema-design.md`; a future Postgres adapter would implement the same interfaces against tables instead.

## Domain Services
- **BookingConflictChecker** — pure logic, no I/O beyond repository reads.
- **CancellationPolicy** — cutoff-window rules.
- **WaitlistPromotionService** — promotes next waitlisted booking when a slot opens.
- **RecommendationEngine** (heuristic, per your Phase-1 decision) — scores vehicles for a customer using simple rules (past wishlist/bookings, price band, body-type affinity) behind an interface that a future LLM-backed implementation can replace without touching callers.
- **InsightEngine** (heuristic) — summarizes customer segments/funnel patterns for manager dashboards using rule-based aggregation, same swap-later interface pattern.

---
This model is the contract the rest of the system is built against. Proceeding to [system architecture, container/component diagrams, database design, and API contracts](06-system-architecture.md) (Phases 6–9).
