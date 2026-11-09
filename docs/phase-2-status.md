# Phase 2 implementation status

Phase 2 was approved with test placeholders: GHS 50 and a semester end of 31 December 2026 at 23:59:59 UTC. Admin was explicitly removed from scope. Phase 3 has not started.

## Implemented

- Hosted Paystack test checkout with server-created checkout snapshots and references.
- Both current timestamped and older raw-body HMAC webhook verification, with no downgrade when the new signing secret is configured.
- Provider transaction verification and atomic entitlement creation, with reference-level idempotency and fixed expiry.
- Failed, abandoned, delayed and refunded payment handling. Processed partial refunds conservatively revoke that payment's pass; late success events cannot restore it.
- A bounded confirmation screen that polls server-owned access and never grants browser-controlled entitlements.
- Server-validated saving/reloading/deleting, one free saved graph, paid unlimited saving with pagination, ownership RLS and an atomic per-user save limit.
- Draft-safe save errors and stable save IDs across retry/refresh. Loading checks again if the table changed during its request.
- Eight static report-guide sections with short good/bad teaching examples, server-only paid rendering and an empty video slot.
- Draft terms/refund pages, private payment audit events, structured operational logs, readiness endpoint and a live-switch checklist.

## Local verification

TypeScript and production build pass. All 184 unit tests and 60 desktop/320px browser checks pass. The dependency audit reports zero vulnerabilities. The SQL migrations and 83 equivalent assertions (20 Phase 0, 63 Phase 2) pass in isolated PGlite PostgreSQL with a simulated Supabase Auth schema. The SQL suite covers ownership, role permissions, free limits, direct-RPC throttling, duplicate webhook deliveries, amount/currency/domain/reference mismatches, refund ordering, expiry and deletion cascades.

PGlite is a local PostgreSQL compatibility check, not hosted Supabase acceptance. Real Supabase/pgTAP execution, SMTP/session verification and actual Paystack test checkout → webhook → entitlement have not been demonstrated by mocks or isolated SQL. Follow `phase-2-acceptance.md` before accepting this phase for users.

## Required service work and limits

1. Replace the Supabase secret previously exposed in chat; confirm staging environment configuration and custom SMTP.
2. Apply the new Phase 2 migration after Phase 0, then run the real database suite through Docker/CI.
3. Supply a Paystack test secret, configure the HTTPS webhook, and run genuine provider test transactions. No Paystack key value has been committed.
4. Verify paid/free report rendering, graph access, deletion and refunds against two real staging accounts.
5. Configure an external health monitor and alerts; verify them against a controlled staging failure.
6. Confirm actual semester price, currency, dates, policy wording and support contact before live use. Supply the video link later.

Separate simultaneous checkout sessions can still both be paid before the first webhook activates access. They cannot extend the configured semester expiry, but duplicate purchases must be reconciled/refunded in Paystack. Add or verify a checkout-reservation/reuse safeguard before real-money launch. This remains a live-launch risk, not a reason to trust a browser callback.

No admin interface, recurring subscriptions, automatic refunds, analytics, live payment keys or generated student reports were added. The live guard requires deliberate application and database changes during separately approved Phase 3 work; changing an environment key alone cannot enable live fulfillment.
