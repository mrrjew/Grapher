# Physics Graph Helper

A learning aid for university physics practicals. Includes verified accounts, step-by-step graph scaling, graph previews, saved graphs, static report guidance and a Paystack test-mode semester pass. There are no AI features, admin accounts or recurring subscriptions.

## Run locally

Use Node.js 22.12 or newer (prefer an LTS release) and npm.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Fill in `.env.local` with your own Supabase project values and a long random `RATE_LIMIT_SECRET`. Set `APP_ORIGIN` to `http://127.0.0.1:3000` for local development and open that exact address. Origin checks deliberately distinguish `localhost` from `127.0.0.1`. Use a new `sb_publishable_...` key for `SUPABASE_PUBLISHABLE_KEY` and an `sb_secret_...` key for `SUPABASE_SECRET_KEY`. Keep the secret key and rate-limit secret on the server. Never use a `NEXT_PUBLIC_` prefix for either secret.

Install the Supabase CLI, link your project and apply the migrations:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
npm run dev
```

The application requires both migrations as well as the provider settings below. Authentication fails closed if its persistent security checks are unavailable. No mock account or development bypass grants access. If applying SQL manually, run `202611070001_phase0_security.sql` once first, then `202611070002_phase2_graphs_and_payments.sql` once. Do not rerun a migration already applied through the dashboard.

## Configure hosted Supabase

These dashboard settings are required; applying SQL migrations alone does not configure hosted Auth:

1. Enable email/password authentication and require email confirmation. Disable unused authentication providers and anonymous sign-ins.
2. Require at least 12 password characters, including uppercase letters, lowercase letters and digits. Enable leaked-password protection if your plan supports it.
3. Set JWT expiry to 900 seconds. Keep refresh-token rotation and reuse detection enabled.
4. Set the Site URL to the exact `APP_ORIGIN`. Allow only the local development origin and actual deployed application origin as email redirect URLs. Remove broad production wildcards.
5. Configure custom SMTP and test delivery. Supabase's default email service is restricted and is unsuitable for student sign-ups. Set a recognizable sender and configure the sender domain's SPF/DKIM records.
6. Configure provider-level Auth rate limits. App limits cannot stop someone calling Supabase's public Auth endpoint directly. Apply appropriate sign-in, sign-up, email-send, token-refresh and verification limits, then test them. Start conservatively and adjust using real lab traffic; many students may share one campus IP.
7. Set the confirmation email link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
8. Set the password recovery email link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`.
9. Set email-token expiry to 30 minutes to match the supplied templates. Disable email click tracking that rewrites or prefetches authentication links. Enable password-change security notifications. Enable secure password change; the app supplies the current password for ordinary password changes.

The supplied email templates are in `supabase/templates`. The confirmation landing page requires an explicit POST before consuming the link, so an ordinary GET from an email scanner does not consume it.

### Temporary signup without email confirmation

The current local setup opts out with `AUTH_REQUIRE_EMAIL_VERIFICATION=false` in ignored `.env.local`; the local Supabase CLI configuration also has `auth.email.enable_confirmations=false`. For a hosted project, turn **Confirm email** off in Supabase's email authentication settings as well. The app cannot change that hosted setting with an API key. Supabase then auto-confirms new signups and returns a session, which opens the workspace directly. No SQL migration is needed; existing session, ownership and payment checks remain active.

To restore verification, set `AUTH_REQUIRE_EMAIL_VERIFICATION=true` and turn **Confirm email** back on in Supabase (or set `enable_confirmations=true` for the local CLI stack). `.env.example` keeps the verification-on default. Restart/redeploy after changes. Disabling confirmation means new users have not proved control of their email address. Existing auto-confirmed accounts are not retroactively verified by re-enabling the setting.

## Security boundaries

Authentication runs on the server through Supabase. Session cookies are HttpOnly, SameSite=Lax and Secure in production. Tokens are not stored in browser local storage. Mutations require the configured same origin, and authenticated responses must not enter shared caches.

Every protected request checks the authenticated user, confirmed email and `current_session_is_active()` in Postgres. The database enforces an absolute 12-hour lifetime using the provider's session creation time and rejects revoked sessions. Refreshing a cookie does not restart that lifetime. This avoids relying on Supabase's paid-plan session timeout feature.

`consume_rate_limit()` uses atomic, persistent database buckets. Only the server's service role can execute it. Bucket identifiers are keyed hashes rather than raw email or IP addresses. An unavailable limiter blocks the auth request rather than allowing unrestricted retries. On Vercel the application uses the platform's trusted client-IP header; keep Vercel as the direct public ingress.

Migrations enable RLS on every application table. Saved graphs, entitlements, checkout attempts and known-user payment logs cascade on account deletion. Raw financial event payloads are server-only; events without a known account retain only minimal operational fields. Browser roles cannot write entitlements or payment attempts. Graph writes go through an authenticated SQL function that locks per account, enforces free/paid limits and applies a persistent successful-write quota. The API separately limits save attempts. Deletion targets the server-verified account and requires password reauthentication.

Do not log passwords, cookies, email tokens, recovery URLs or environment values. Treat provider and hosting logs as sensitive operational data.

### API key migration

In Supabase **Settings → API Keys → Publishable and secret API keys**, create or copy your new keys. Set `SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` and `SUPABASE_SECRET_KEY=sb_secret_...` in your ignored `.env.local` and the appropriate Vercel environment. Remove the previous legacy server-key setting; there is no fallback to legacy JWT API keys. Restart the local server or redeploy after changing environment settings.

Verify signup, verification, login, recovery, password change, persistent rate limiting and account deletion using the new keys. Only then disable legacy API keys in Supabase. Key replacement does not require changing database roles, RLS policies or user session JWTs. The new secret key still bypasses RLS and must remain server-only. See [Supabase's migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

## Checks

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

Install the Playwright Chromium browser before the first browser run:

```powershell
npx playwright install chromium
```

Browser checks use the production build, so run `npm run build` first. If Chrome is already installed, PowerShell users can set `$env:PLAYWRIGHT_CHANNEL='chrome'` before `npm run test:e2e` instead of downloading Chromium.

Graph interaction checks use an isolated Vite component host under `tests/harness` on port 3001. It renders the real graph component without Supabase and is not a route or authentication bypass in the Next.js application. Playwright starts and stops that host and a production app on port 3100, leaving the normal development port free. You can run `npx vite --config tests/harness/vite.config.ts` to inspect the component locally while service configuration is pending; use fictitious data there.

## Graph helper

After verified login, enter a title, variable names and optional units. Enter paired measurements, choose 2–50 boxes per axis, then select **Show scaling and preview**. A comma means a decimal point; thousands separators are not supported. Completely empty trailing rows are ignored. Incomplete rows and nonnumeric entries are identified without clearing the table. Up to 1,000 rows are accepted to keep the phone interface and local draft bounded.

All axis calculations live in the pure `src/lib/scaling.ts` module and run in the browser. Steps use `1, 2, 5 × 10ⁿ`. The start is aligned downward, then the step is increased if needed to fit every point within exactly the requested number of boxes. Single points and equal values retain their true zero range; an explained display span is added for plotting. Values beyond reliable numerical precision receive guidance rather than misleading axes.

The preview uses grid-box coordinates internally with actual measurement labels, avoiding chart-library limits for huge or tiny units. It plots measurements only. The table and textual axis results remain available for keyboard and screen-reader use; narrow screens can scroll the graph within its own region.

Drafts are account-scoped in local storage, validated on restoration, and written on each edit. They are not saved to Supabase or synced between devices. Another tab reads the latest stored draft, and the last edit wins. Logout, account deletion and password changes clear this browser's draft and close graph views in other tabs. Browser storage failures leave the current table usable but prevent refresh recovery. Local drafts are not encrypted; log out on shared lab devices.

Automated local checks do not prove hosted email delivery, production cookie behavior or provider settings. Complete [the Phase 0 acceptance checklist](docs/phase-0-acceptance.md) against your actual deployment before approving the phase.

Database security tests require the Supabase CLI and a running Docker-compatible engine:

```powershell
supabase start
supabase test db
```

These tests exercise database permissions, rate limits, authoritative sessions, graph ownership, atomic limits and payment idempotency/refunds. Equivalent assertions were also executed in isolated PGlite PostgreSQL with a simulated Auth schema. That check does not replace the real Supabase/pgTAP run, which still requires Docker or CI.

## Paystack test setup

1. Keep the approved placeholders in `src/lib/semester.ts`: GHS 50 (`5000` minor units), expiry `2026-12-31T23:59:59.000Z`. Price display is derived from those settings. This is the only price/currency/semester configuration file.
2. Put your Paystack **test** secret in `PAYSTACK_SECRET_KEY` in ignored `.env.local` and your staging Vercel settings. Live keys are deliberately rejected.
3. Set the test webhook URL to `https://YOUR-STAGING-ORIGIN/api/payments/webhook`. Checkout sets its callback to `/payments/return` on `APP_ORIGIN`. Restart or redeploy after environment changes.
4. If your integration has a new webhook signing secret, set `PAYSTACK_WEBHOOK_SECRET=whsec_...`. It enables timestamped `Paystack-Signature` verification with a five-minute tolerance. Otherwise the older `x-paystack-signature` HMAC is supported with the test API secret. When the new secret is set there is no fallback after a missing/invalid new signature.
5. Complete [Phase 2 hosted acceptance](docs/phase-2-acceptance.md). Use provider test checkout details only; never enter a real card for test verification.

Checkout stores the verified owner, reference, amount, currency, plan and expiry before contacting Paystack. The webhook authenticates raw bytes and verifies the transaction with Paystack before an atomic database function can grant access. A unique reference prevents duplicate entitlements and expiry extension. Verification outages and pending provider states return retryable failures without consuming the actual event's idempotency key. The browser return page polls for about 20–25 seconds; neither it nor status polling can grant access.

Free accounts can keep one saved graph. Paid accounts can save and reload unlimited graphs through a paginated list. Saving uses a persistent graph ID so a timeout or refresh can retry without making another graph. On expiry or a processed refund, the oldest graph remains available on the free plan; additional saved graphs stay stored until a new pass restores access or the account is deleted. Any verified processed refund, including a partial refund, revokes the pass for that reference. Refunds are managed in Paystack, not an admin page in this app.

Full report-guide content lives in `src/content/report-guide.ts` and is rendered only after the server checks paid access. The video URL remains unset. `/terms` and `/refunds` contain draft test policies. Live wording and the contact channel must be confirmed before launch.

Structured payment/error logs include operation and correlation IDs without secrets, emails or raw payloads. `/api/health` returns database readiness without exposing configuration. An external uptime monitor and alert destination still need to be configured in your hosting/monitoring account; code alone does not create those services. See [the live-switch checklist](docs/paystack-live-checklist.md) before any Phase 3 work.

## Deploy to Vercel

1. Put this project in a private Git repository and connect it to Vercel using its Next.js preset. Keep the committed lockfile and use `npm ci` for installation.
2. Create a separate Supabase project for production. Apply the migration and all Auth settings above. Never point arbitrary preview deployments at production user data.
3. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `RATE_LIMIT_SECRET` and `APP_ORIGIN` in Vercel. Use the exact HTTPS application origin, with no trailing path. Use separate values for preview and production environments.
4. Deploy from the connected repository. The included GitHub workflow runs type checks, unit tests, the production build, dependency auditing and browser smoke checks. Configure repository branch protection to require the workflow before merging; enable Vercel's deployment checks so production waits for required CI.
5. Complete the hosted acceptance checklist. Check email links, HTTPS cookies, expired sessions, throttling and account deletion. Record the results before allowing students to sign up.

No hosted project is created or deployed by merely running the local build. Supabase and Vercel credentials, account configuration and the production domain must be supplied by the project owner.

## Phase boundaries

- Phase 0: account foundation, database security, deployment pipeline and empty logged-in workspace.
- Phase 1: graph inputs, scaling maths, tests, preview and browser draft recovery. No saving or payments.
- Phase 2: Paystack test checkout/webhooks, saving/reloading, report content, draft policies and monitoring hooks. Test price/date placeholders are configured; real values and video remain to be supplied.
- Phase 3, only after explicit approval: live payments, final legal wording, analytics and feedback fixes.

Each phase needs the owner's approval before coding starts. No AI features are part of this application.

Implementation references: [Supabase server-side authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [session behavior](https://supabase.com/docs/guides/auth/sessions), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates) and [Vercel request headers](https://vercel.com/docs/headers/request-headers).
