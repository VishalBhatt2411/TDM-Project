# Salesforce Schema Design (Deployed)

**Status: Deployed to org `tdm-dev`** (instance `moreyeahs2-dev-ed.develop.my.salesforce.com`, username `vishal.bhat@wahinnovations.com`)

This is the first concrete implementation of the "Salesforce Adapter" repository target described in [Phase 1](01-product-vision-and-requirements.md). Metadata source lives at [integrations/salesforce/mdapi](../integrations/salesforce/mdapi) and was deployed via `sf project deploy start --metadata-dir mdapi --target-org tdm-dev`.

**Important scoping note:** this schema was designed and deployed directly against a real, live Salesforce org per your request. It has not yet gone through the full Phase 5–9 domain-model/API-contract design pass — treat it as the concrete v1 of that design, refined in place rather than diagrammed first. If the later architecture phases surface a needed schema change, we'll evolve this same metadata rather than starting over.

## Registration-first decision (per your instruction)

Test drive booking **requires prior registration**. No guest booking. The customer's verified email + phone captured at registration become the `Contact` record used for every downstream booking, and are exactly the fields carried forward into `Lead`/`Opportunity` creation later in the funnel — this was the explicit reason you gave for requiring registration, and it's now reflected structurally: `Booking__c.Contact__c` is a **required** lookup, and `Lead.Portal_Contact_Id__c` exists specifically to prevent duplicate-customer creation at conversion time.

## Object model

### Standard objects extended
| Object | New fields | Purpose |
|---|---|---|
| **Contact** | `Portal_User_Id__c` (unique/external ID), `Preferred_Language__c`, `Marketing_Opt_In__c`, `License_Number__c`, `License_Verified__c` | Represents the **registered customer**. `Portal_User_Id__c` is the join key back to our own auth system. |
| **Lead** | `Booking__c`, `Vehicle_Interest__c`, `Portal_Contact_Id__c`, `Source_Channel__c` | Created when a completed drive shows real purchase interest — the "if everything goes well" signal you described. `Portal_Contact_Id__c` lets Lead conversion attach to the *existing* Contact instead of creating a duplicate person record. |
| **Opportunity** | `Booking__c`, `Vehicle__c` | The sales pursuit, traceable back to the exact drive and vehicle that generated it. |

### New custom objects
| Object | Key fields | Purpose |
|---|---|---|
| **Branch__c** | Address/geo, contact info, operating hours, manager name, active flag | Dealership location |
| **Vehicle__c** | Make/Model/Trim/Year/VIN, body/fuel/transmission picklists, price, status, branch lookup, media/spec JSON fields | Inventory & catalog item |
| **Sales_Rep__c** | Email, phone, branch lookup, optional `User__c` lookup, max daily bookings | Rep roster — deliberately **not** modeled as a Salesforce licensed User, since reps authenticate through our own app, not Salesforce login |
| **Booking__c** | Contact/Vehicle/Branch/Sales Rep lookups (all required except rep), drive type, scheduled/actual times, status lifecycle, check-in, odometer, cancellation, self-lookup for reschedule chains, waitlist position | The core test-drive record |
| **Compliance_Record__c** | OTP/license/consent/signature fields, child of Booking (cascade delete) | Auditable compliance trail per drive |
| **Drive_Feedback__c** | Rating, comments, rep notes, interest level, purchase interest flag, child of Booking (cascade delete) | Structured post-drive capture feeding opportunity creation |
| **Wishlist_Item__c** | Contact + Vehicle junction | Saved vehicles |
| **Vehicle_Allocation__c** | Vehicle, from/to branch, transfer date, status | Cross-branch inventory transfers |

## Key modeling decisions & rationale

1. **No Person Accounts assumed.** This Dev Edition org doesn't have Person Accounts enabled by default, so `Contact` is used standalone (Salesforce allows a Contact with no `AccountId`). When an `Opportunity` needs to be created (which mandates an `AccountId`), the Salesforce adapter (built in Phase 12) will create a lightweight personal Account for that Contact at that moment — this is a standard B2C-on-Salesforce pattern, not a schema gap.
2. **Sales_Rep__c is decoupled from Salesforce `User`.** Reps log into *our* platform, not Salesforce directly, so we didn't require a licensed Salesforce User per rep. The optional `User__c` lookup exists only for orgs that do want that link later.
3. **Required lookups use `Restrict` delete constraint**, not `SetNull` — Salesforce disallows `SetNull` on a required field (this is a real constraint we hit and fixed during deployment: attempting `SetNull` on `Booking__c.Contact__c`/`Vehicle__c`/`Branch__c` and `Vehicle_Allocation__c.To_Branch__c` failed validation and was corrected to `Restrict`).
4. **Compliance and Feedback are separate child objects**, not fields on `Booking__c` directly — keeps the booking record lean and lets compliance data cascade-delete cleanly if a booking is ever purged, without polluting the core scheduling object.
5. **JSON-in-text fields** (`Gallery_Urls__c`, `Spec_Sheet_Json__c`, `Accessories_Json__c`) are a pragmatic v1 choice to avoid over-normalizing media/spec data into more objects before we know real usage patterns; flagged as a candidate for future normalization if querying/filtering on spec attributes becomes a requirement.

## Verification performed

- `sf project deploy start --metadata-dir mdapi --target-org tdm-dev --dry-run` → 105/105 components valid, 0 errors (after fixing the delete-constraint issue above).
- Real deploy → 105/105 components deployed, 0 errors.
- `sf sobject describe --sobject Booking__c --target-org tdm-dev` → confirmed the object and its fields are live and queryable.

## What's intentionally not yet built here

- No page layouts, list views, validation rules, or Apex — this is schema-only, matching the "set up the Salesforce schema" scope of this request.
- No sample/seed data loaded yet.
- The actual **Salesforce Adapter** (NestJS repository implementation that talks to this schema via SOQL/DML) is Phase 12 work, not this step.
