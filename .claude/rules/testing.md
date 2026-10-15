# Testing Standards

Run with `npm test` (CI runs it after lint). Tests live in the root `tests/` folder as `<subject>.test.ts`, use Node's built-in `node:test` + `node:assert/strict`, and are loaded by `tests/run.js` through `ts-node` (transpile-only). Add no test framework or runner dependency without a reason `node:test` can't cover.

What to test:
- Behaviour that can fail silently or only under production conditions: concurrency (token rotation, refresh locks, in-flight dedup), security decisions (refresh-token reuse, tenant fail-closed), failure fallbacks (Redis down, unreadable stored session), and data-retention deletes that cascade.
- A bug fix gets a test that fails without the fix.

How:
- Unit-test an adapter against a hand-written double of its collaborator (a Prisma delegate, a Redis `multi()` chain, the connection provider's options) — never a live database, Salesforce org, or network.
- Doubles implement only what the code under test calls, typed at the seam (`as unknown as PrismaClient`); keep them in the test file that uses them until a second file needs the same one.
- Never assert on, or log, a secret: a test that exercises a failure path asserts the log line carries identifiers and event names only (see `security.md`).
- Stub a global (`console.warn`, `jsforce.OAuth2.prototype`) only inside the test that needs it, and restore it in `afterEach`.
- Tests must be deterministic: no real sleeps, no wall-clock thresholds closer than the margins the code itself uses (use offsets like "60 s ago" against a 10 s window).
