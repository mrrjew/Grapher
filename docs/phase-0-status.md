# Phase 0 implementation status

Historical Phase 0 checkpoint: the local implementation was ready for service configuration and hosted acceptance. Phase 0's hosted acceptance remains pending. Phase 1 was subsequently authorized separately; see `phase-1-status.md` for its status.

Built: Next.js/TypeScript foundation, mobile account forms, Supabase server-side auth, verification and recovery email interstitials, password reauthentication, deletion, HttpOnly cookies, same-origin mutations, nonce-based script CSP, no-store responses, database session expiry/revocation gate, persistent rate limits, RLS migration, email templates, environment example and CI/deployment instructions.

Verified locally on 7 November 2026 (UTC):

- Production build and TypeScript checks pass.
- 48 unit tests pass, including authentication routes, recovery proofs, input validation and session gates.
- 8 browser checks pass against the production build using installed Chrome, on desktop and a 320px phone viewport.
- Desktop and phone login screenshots visually inspected.
- Dependency audit reports zero vulnerabilities, including development dependencies.

Prepared but unverified: 20 database assertions in `supabase/tests/security.test.sql`. The local Docker daemon is unavailable. CI includes a separate Supabase database test job, but no remote CI run has occurred.

Required before Phase 0 approval:

1. Supply service configuration through ignored environment files or hosting settings, never chat or committed files.
2. Apply migrations and configure hosted Supabase Auth, custom SMTP and the supplied email templates.
3. Run database tests with the Supabase local stack or dedicated CI environment.
4. Connect the repository to Vercel and configure the exact HTTPS origin.
5. Complete `docs/phase-0-acceptance.md` against two real test accounts, including email delivery, session refresh, throttling, password changes and deletion.

No graph helper, graph saving, report guide, paywall, payment integration or analytics is included. Future user-data tables need their own RLS and account-deletion cascades. Save-endpoint rate limits belong with the Phase 2 save endpoints.
