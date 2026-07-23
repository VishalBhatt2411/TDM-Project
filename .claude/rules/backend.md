---
paths:
  - 'apps/**/api/**'
  - 'apps/**/services/**'
  - 'apps/**/controllers/**'
  - 'apps/**/repositories/**'
  - 'packages/**'
---
<!-- Adjust if your backend app folder is e.g. apps/api or apps/backend and uses a different internal layout. -->


# Backend & API Standards

Architecture:
- Thin controllers, service layer owns business logic.
- Repository pattern for data access; adapter pattern for external systems (Salesforce, future backends).
- Dependency inversion — services depend on interfaces, not concrete adapters.
- Configuration-driven, not hardcoded.

API:
- Versioned, validated, documented, consistent.
- Proper HTTP status codes, pagination, filtering, sorting.
- Standardized error response shape.

Performance:
- Assume millions of records eventually. Reduce API calls, optimize queries, cache where it makes sense.
