# Paystack live release checklist

This is preparation for Phase 3. Phase 2 is test-only. Do not begin the live switch until the owner explicitly approves Phase 3 and confirms the commercial and policy details.

## Before changing credentials

- [ ] Complete and record [Phase 2 hosted acceptance](phase-2-acceptance.md), including real Paystack test checkout, duplicate/slow webhook delivery, failed and abandoned payments, processed refunds and direct RLS attempts.
- [ ] Complete the outstanding Phase 0 hosted authentication/database checks. Configure production SMTP, confirmed-email access, allowed redirects, password rules and session limits.
- [ ] Revoke and replace the Supabase secret exposed during development. Use separate staging and production Supabase projects and secrets. Ensure production secrets are absent from commits, previews, logs and browser bundles.
- [ ] Obtain explicit approval of the final price, currency, plan identity, semester expiry and timezone. Update the single semester configuration file and verify the displayed amount agrees with the minor-unit amount sent to Paystack.
- [ ] Replace the draft terms/refund text with final owner-approved wording and a real support contact. Confirm what happens after a processed partial refund and account deletion. Explain that Paystack may retain its own processor records.
- [ ] Confirm the Paystack account is enabled for the intended live currency and payment methods. The integration must remain a one-off semester pass, not a recurring subscription.

## Deliberate code changes are required

Changing `PAYSTACK_SECRET_KEY` alone cannot enable live payments in this build. Its application key guard only accepts `sk_test_...`; the database payment-application function also requires a verified transaction with `domain = 'test'`, and semester configuration is marked test-only.

- [ ] Implement and review an explicit production-mode configuration. Update the application key guard, semester mode check, transaction matching and database domain guard together. A live deployment must require the live domain; do not weaken the guard to accept both domains indiscriminately.
- [ ] Add regression checks that a live environment rejects test transactions and a test environment rejects live transactions. Keep the reference, owner, amount, currency, expiry, signature and unique-entitlement checks intact.
- [ ] Keep the webhook as the only entitlement-granting path. Callback pages, status polling, browser state and metadata supplied by a user must never grant access.
- [ ] Preserve atomic free-graph limits, server-side entitlement checks and idempotent payment application. Recheck late-success-after-refund ordering before release.

## Production service configuration

- [ ] Set the exact HTTPS `APP_ORIGIN`, production Supabase URL/publishable/secret keys and a fresh production `RATE_LIMIT_SECRET` in the production hosting environment.
- [ ] Set the production Paystack secret only in server environment settings after the reviewed live-mode implementation is deployed. Never copy it into `.env.example`, a browser setting or a command argument that can enter logs.
- [ ] Configure the live webhook URL as `https://YOUR-PRODUCTION-ORIGIN/api/payments/webhook` and the callback as `/payments/return`. Keep test and live dashboard settings separate.
- [ ] Prefer an active live webhook signing secret in `PAYSTACK_WEBHOOK_SECRET` and verify the timestamped `Paystack-Signature` header end to end. When a signing secret is configured, do not fall back to the legacy signature after a failed new-signature check.
- [ ] If the live integration still requires the legacy signature path, document that condition and verify the raw-body `x-paystack-signature` check using the matching live secret. Plan the new-header transition separately and test it before removing any existing signing configuration.
- [ ] Apply and verify all production migrations through the normal deployment process. Restrict the private schema and raw payment event records; keep RLS enabled.
- [ ] Set up an external uptime monitor for `/api/health`, a working alert destination and access to structured hosting logs. Confirm monitoring actually alerts on a controlled staging outage. Do not place raw payment payloads or user data in external logs.

## Controlled launch and recovery

- [ ] After owner approval, run a controlled live transaction for the approved amount and currency. Confirm hosted checkout, callback confirmation, webhook verification and one entitlement with the correct expiry.
- [ ] Replay a genuine delivery through the provider's supported retry mechanism. Access must not be granted twice or extended.
- [ ] Test the agreed refund process and verify its access outcome. Do not promise a refund completion time the processor has not confirmed.
- [ ] Verify support can locate a payment by its reference without requesting a password, secret or card details.
- [ ] Record the production commit, migration versions, configuration approvals, UTC launch time and verification results without copying secret values.
- [ ] Prepare a recovery procedure that can stop new checkout attempts while preserving graph data, entitlement records and webhook processing for payments already in flight. Do not delete financial rows or disable the webhook to hide an incident.
- [ ] Add analytics only within the separately approved Phase 3 scope. There is no admin interface, automatic refund button or analytics integration in Phase 2.

Phase 3 approval, owner and UTC date:

Reviewed production commit and migrations:

Remaining launch blockers:
