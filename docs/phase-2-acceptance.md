# Phase 2 hosted acceptance

This is a manual checklist for a dedicated staging Supabase project and HTTPS Vercel deployment. It has not been completed by preparing these files or passing mocked tests. Use two verified accounts you control, A and B, and Paystack test payments only. Record the deployed commit, UTC date, tester and result. Keep keys, email links, session cookies, card details and raw webhook payloads out of the record.

## Prepare staging

- [ ] Complete the outstanding [Phase 0 hosted checks](phase-0-acceptance.md), including email delivery, password recovery, revocation and account deletion.
- [ ] Replace the Supabase secret previously exposed in chat. Use modern publishable/secret keys, a fresh rate-limit secret and custom SMTP. Keep `.env.local` ignored and production credentials out of staging.
- [ ] Apply every migration in timestamp order. Run the database security tests and confirm RLS is enabled on every application table.
- [ ] Confirm `src/lib/semester.ts` contains the approved test placeholders: GHS 50, amount `5000` in minor units, expiry `2026-12-31T23:59:59.000Z`, test mode enabled. Checkout must become unavailable after expiry.
- [ ] Set only a Paystack `sk_test_...` secret in `PAYSTACK_SECRET_KEY`. Confirm the application rejects a dummy live-format key without making a live transaction or exposing the key in its response.
- [ ] Set the Paystack test webhook URL to `https://YOUR-STAGING-ORIGIN/api/payments/webhook`. Confirm the configured callback returns to `/payments/return` on that same origin.
- [ ] Where the Paystack test integration supports the new signing secret, set `PAYSTACK_WEBHOOK_SECRET=whsec_...` and confirm a real test event carries `Paystack-Signature`. Otherwise test the documented legacy signature path before enabling the new signing secret.

## Checkout and ownership

- [ ] A free verified user sees one plain upgrade screen with the test price, currency, expiry, included access, terms and refund links. There is no recurring subscription, admin page or live-payment claim.
- [ ] A signed-out or unverified visitor cannot initialize checkout, save a graph, fetch payment status or open the paid report guide.
- [ ] Checkout requests require the exact configured origin. A missing or different Origin is rejected. Repeated checkout attempts are persistently limited.
- [ ] The server creates the transaction reference and stores the amount, currency, plan, expiry and verified owner before contacting Paystack. Changing request fields cannot set a cheaper price, another user or a later expiry.
- [ ] The browser navigates to Paystack's HTTPS hosted checkout. Card details do not pass through an application form, API or log.
- [ ] B cannot use A's reference to read its payment status or obtain its pass. The callback reference alone does not establish ownership or grant access.
- [ ] Account A with an already active pass cannot purchase another pass through the checkout endpoint.

## Signatures and verification

- [ ] For the new signature path, verify the HMAC over the timestamp, a dot and the exact raw request bytes. Reject missing, malformed or incorrect signatures and timestamps outside the allowed five-minute window.
- [ ] With `PAYSTACK_WEBHOOK_SECRET` configured, an invalid or missing new signature is rejected even if a valid legacy `x-paystack-signature` header is also supplied. There is no downgrade fallback.
- [ ] For an older integration with no new signing secret configured, verify `x-paystack-signature` as HMAC SHA512 over the raw bytes with the test secret. Changing whitespace or any payload byte without resigning must fail.
- [ ] An invalid signature does not trigger transaction verification, payment mutation or entitlement creation. Check the structured rejection log without recording the untrusted raw payload.
- [ ] A valid signature alone is insufficient: the handler calls Paystack's transaction verification endpoint before applying a payment event.
- [ ] Wrong verified amount, currency, reference or transaction domain cannot create an entitlement. A reference unknown to this app does not unlock anyone's account.
- [ ] A verification timeout or unavailable database leaves access locked and returns a retryable failure. A subsequent genuine delivery can still complete the payment.
- [ ] Signed events and processing outcomes are recorded in `payment_events`; raw signed payloads stay restricted to backend access. Ordinary authenticated users cannot read the event log or call the payment-application RPC.

## Success, slow delivery and retries

- [ ] Complete a real test checkout for A. Visiting the callback first shows a confirming state, not a paid state. The page unlocks only after the verified webhook creates the entitlement row.
- [ ] Pause or delay webhook delivery in staging. The return page polls briefly, then explains that confirmation is still pending. Reloading the page or changing its URL cannot unlock access.
- [ ] Deliver the genuine delayed event. One entitlement is created for A with the stored semester expiry. A can then use paid actions and open the report guide.
- [ ] Resend the same event several times, including concurrent deliveries. There is still one entitlement for the reference, and neither the start nor expiry is extended.
- [ ] Deliver a semantically repeated success event with different harmless payload formatting. The unique transaction reference still prevents a second grant.
- [ ] Confirm callback/status polling never inserts an entitlement, even when Paystack verification reports success before the webhook arrives.
- [ ] Complete a failed or abandoned test checkout. The app shows the corresponding outcome, records it and offers a safe route back without granting access. Retrying creates a new server-owned payment attempt.

## Refunds and event order

- [ ] Initiate a refund through the Paystack test dashboard. There is no application refund or admin button in this phase.
- [ ] Pending, processing and failed refund notifications are logged and do not incorrectly grant a pass or revoke an unrelated valid pass.
- [ ] A genuine verified `refund.processed` event revokes access from its transaction reference. Test a full refund and a processed partial refund; this application removes that pass for either processed outcome.
- [ ] Replay the processed refund. It cannot produce extra grants or alter an unrelated payment's dates.
- [ ] Deliver a refund before a delayed success notification, then replay the success. The refunded reference remains terminal and cannot grant or reactivate a pass.
- [ ] If the account has another independently valid entitlement, refunding one reference does not revoke the other.

## Saved graphs and server enforcement

- [ ] A free account can save, reload and update one graph. Title, variables, units, rows and both grid-box choices survive reloading.
- [ ] Send two concurrent first-save requests with different graph IDs for the same free account. At most one new graph is stored. Repeat an identical request after a timeout; the same ID does not create a duplicate.
- [ ] Saving a second graph is rejected on the server for a free user, including direct API/RPC requests. A paid user can save multiple graphs.
- [ ] B cannot read, update or delete A's graph by changing an ID, body or URL. Direct Supabase requests using B's user JWT remain constrained by RLS.
- [ ] Direct inserts or updates cannot bypass the save RPC or its free-limit check. Authenticated clients cannot write financial tables or grant themselves an entitlement.
- [ ] In staging, expire or revoke A's pass. Its next paid action is denied. If it has several saved graphs, only the allowed free graph remains readable/editable; it can still delete its own other graphs.
- [ ] In staging, expire or revoke the provider session. Every protected server action rejects the next request, independently of the visible UI.
- [ ] Simulate a slow/failed save response. The page gives a clear message and retains the current table and browser draft. A retry reuses the intended graph ID rather than making an accidental duplicate.
- [ ] Edit and save the same graph in two tabs. The last completed save wins without a crash. Refreshing restores a valid local draft rather than silently discarding unsaved entries.

## Report guide and deletion

- [ ] The full report guide is rendered only after a server-side entitlement check. A free account's HTML/RSC responses and client bundles do not contain the paid guidance.
- [ ] Paid users see all eight sections, each with what belongs in it and short good/bad examples. The guide teaches the method and does not generate a report.
- [ ] The empty video slot is readable and contains no unreviewed iframe or external video request. A new video link still requires the owner to supply and review it.
- [ ] Deleting A requires current-password confirmation, clears this browser's draft and removes A's application graph, entitlement, payment-attempt and owned payment-event rows through the configured deletion cascades. B's data remains usable.
- [ ] Deletion does not claim to erase records held separately by Paystack. The policy explains processor retention and does not imply an automatic refund.

## Monitoring and usability

- [ ] `/api/health` returns an appropriate status without keys, user information or internal error details. Simulate an unavailable database and confirm it returns an unavailable response.
- [ ] Inspect structured Vercel logs for checkout failure, signature rejection, verification outage and successful processing. Logs must not contain secrets, session values, card details, user emails or raw payment payloads.
- [ ] Configure an external uptime check and alert destination in an owner-controlled account. The health route alone does not deliver alerts, and no external monitoring account is configured by these source files.
- [ ] Complete checkout return, saved-graph controls, upgrade and report sections using the keyboard and a small phone. Confirm messages remain legible, focus is visible and slow responses do not leave permanent loading states.
- [ ] CI and the production build pass. Record genuine hosted test results separately from mocked unit/browser checks.

## Acceptance record

Deployment and commit:

Tester and UTC date:

Unverified or failed checks:

Owner's Phase 2 approval:
