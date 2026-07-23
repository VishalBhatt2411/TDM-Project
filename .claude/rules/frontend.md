---
paths:
  - 'apps/**/components/**'
  - 'apps/**/pages/**'
  - '**/*.tsx'
  - '**/*.jsx'
---
<!-- Adjust if your frontend app folder is e.g. apps/web or apps/frontend and uses a different internal layout. -->


# Frontend Standards

- UI = presentation only. Business logic belongs in services, not components.
- Keep components small and reused, not duplicated.
- Mobile-first, responsive, accessible.
- The app should read as a premium automotive platform — no empty pages. Populate with realistic sample data during development.
- Every screen needs: loading state, empty state, validation, success messaging, error handling.
- Minimize clicks, reduce cognitive load — recommend UX improvements when you see friction, don't just implement as literally requested.
