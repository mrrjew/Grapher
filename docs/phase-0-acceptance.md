# Phase 0 hosted acceptance

Run these checks against a dedicated staging Supabase project and HTTPS Vercel deployment. Use two accounts you control, A and B. Record the deployed commit, date, tester and result for each item. Do not record passwords, tokens, full email links or service keys.

Local tests and mocks are useful regression checks, but this list requires real provider and database behavior. Unchecked items remain unverified.

## Configuration

- [ ] Migrations applied successfully. All application tables have RLS enabled.
- [ ] Email confirmation is required in hosted Auth, including requests made directly to Supabase's public API.
- [ ] Hosted password policy rejects passwords shorter than 12 characters or missing uppercase, lowercase or digits. Test direct provider requests as well as the UI.
- [ ] Site URL, redirect allowlist, custom SMTP, token expiry, JWT expiry and security notifications match the README.
- [ ] The app uses `sb_publishable_...` and `sb_secret_...` API keys. No secret API key, rate-limit secret, session token or password appears in client JavaScript, browser local storage or logs.
- [ ] Ordinary anonymous and authenticated roles cannot read or modify internal rate-limit buckets or execute `consume_rate_limit()`.
- [ ] CI passes and the production build deploys successfully. Production requires HTTPS and uses the expected configured origin.

## Sign-up and email verification

- [ ] Create A. Before verification, A cannot enter the workspace, including by directly requesting its URL.
- [ ] Reload or open a second tab while unverified. Access remains blocked.
- [ ] Check spam/delayed-mail guidance and the resend cooldown. Repeated requests are limited.
- [ ] Fetch the confirmation URL without submitting the page. The token remains usable; a GET alone does not verify it.
- [ ] Submit the confirmation form. A becomes verified and enters the empty workspace.
- [ ] Reuse the consumed link and try an expired or modified token. Show a friendly error without exposing provider codes or secrets.
- [ ] Attempt to sign up using A's address again. The response does not reveal whether the account already exists.

## Sessions and access

- [ ] Wrong passwords fail with a neutral message. Repeated attempts are persistently limited across tabs and server instances.
- [ ] B can sign in after its own verification. Its displayed account identity is B's, never A's.
- [ ] On HTTPS, inspect cookies: HttpOnly, Secure, SameSite=Lax, path `/`. Authenticated HTML and session responses are private/no-store.
- [ ] Log out A. Refresh, browser Back, direct URL access and a second tab cannot recover access. A copied unexpired access token cannot pass the app's server session check after revocation.
- [ ] In staging only, age A's `auth.sessions.created_at` beyond 12 hours using an administrative SQL session. Its next protected request is rejected even if a cookie or JWT has been refreshed.
- [ ] Revoke A's session through Supabase and retry a protected request. Reject it immediately at the database session check.
- [ ] Send a state-changing request from another origin, with a mismatched Origin, or with no Origin. Reject it without changing the account. No permissive CORS header is returned.
- [ ] Make Supabase or the limiter unavailable in staging. Auth operations fail safely with a readable message and do not bypass checks.

## Password recovery and change

- [ ] Request a reset for A and for an unknown address. Both give the same neutral response and delayed-email guidance.
- [ ] Rapidly request another email. The cooldown and persistent rate limits apply; retry works after the documented wait.
- [ ] Open the recovery link in a different browser/device. Explicit confirmation opens the reset form without requiring the original browser.
- [ ] A plain GET to the recovery landing page does not consume the token.
- [ ] A short/invalid new password is rejected on both client and server. A valid new password works; the previous password fails.
- [ ] An expired, reused or modified recovery token fails safely.
- [ ] A logged-out visitor cannot use the reset form without a verified recovery session. An ordinary login session cannot bypass the recovery requirement.
- [ ] Logged-in password change requires the current password. Wrong current passwords and repeated attempts are limited.
- [ ] Confirm session invalidation behavior after a password change/reset, including another browser, and require a fresh login where specified by the application.

## Deletion and data isolation

- [ ] A cannot delete B by altering a form, URL or body field. The server derives the target ID from A's verified session.
- [ ] Deletion requires the current password and explicit confirmation. Wrong passwords do not delete anything.
- [ ] Successful deletion hard-deletes A from Supabase Auth, ends its sessions and clears app cookies. A cannot sign in afterward.
- [ ] B remains present and usable after deleting A.
- [ ] Verify there are no user-owned application rows left for A. Phase 0 has no graph/payment records; repeat this check when later tables are introduced.
- [ ] No browser client can assign itself a paid entitlement. No payment or saved-graph endpoint is present in Phase 0.

## Usability

- [ ] Complete sign-up, login, recovery, password change and deletion using only the keyboard.
- [ ] At a 320px viewport, all forms fit, labels remain visible and focus is clear. Errors are readable without relying only on color.
- [ ] Slow or failed requests leave a clear outcome, with no raw errors or permanent loading state.
- [ ] At the Phase 0 checkpoint, the signed-in page was an empty foundation with account controls. For the separately approved Phase 1 build, verify the graph helper appears on that same protected page. Guide content, payments and a dashboard remain absent.

## Approval record

Deployment/commit:

Tester and UTC date:

Failed or unverified checks:

Owner's Phase 0 approval:
