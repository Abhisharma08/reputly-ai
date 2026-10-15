# Reputly AI

Full application implementation of `../Reputly_AI_PRD_Technical_Spec.md`: Supabase accounts and tenant isolation, locations, stable QR codes and managed NFC review tags, bilingual customer assistance, actual event analytics, Cashfree subscriptions, team invitations, MFA-gated administration and scheduled deletion. The guest demo remains separate at `/demo`.

The application builds without credentials. Live features require the configuration below; no Supabase project, payment mandate or production deployment was created during implementation. The optional AI diagnostic sends synthetic provider requests.

## Run locally

Requires Node 22.13+.

```sh
npm ci
cp .env.example .env.local
npm run dev:next
```

Open `http://localhost:4173`. Fill `.env.local` locally; it is ignored by Git. `dev:next` runs standard Next.js on Node, using the same outgoing-request runtime as `check:ai`. If you already configured `.env.local`, keep that file rather than copying the template over it. Keep secrets in server configuration, never `NEXT_PUBLIC_*` or `VITE_*` variables. Restart after changes.

The Sites/Vinext preview is also available with `npm run dev -- --port 4173`; it reads `.dev.vars` and runs server requests in Cloudflare's local Worker runtime. Stop one development server before starting the other on the same port. Keep both environment files synchronized if you use both frameworks. When `check:ai` succeeds in Node but the Vite app reports `network_error`, use `dev:next` to run the application in Node while investigating Worker-specific connectivity. This does not prove connectivity on a deployed Worker.

`/demo` is usable without credentials. `/app` shows setup instructions until Supabase is configured. A configured `/app` requires a verified authenticated account and accepted membership.

## Supabase setup

1. In your Supabase project, obtain its URL, publishable key and service-role key. Enter them locally in the corresponding server variables. The service-role key is never sent to the browser.
2. Apply the files in `supabase/migrations/` in filename order through the Supabase SQL editor or CLI. **Use a dedicated project:** the initial migration owns the public schema and changes public function grants. It is not a migration for an unrelated existing application.
3. Enable email confirmation, configure production SMTP, and set Site URL to `APP_URL`. Allow `APP_URL/auth/callback`, `APP_URL/auth/callback?next=/reset-password` and the exact application callback URLs you use. Development example: `http://localhost:4173/auth/callback`.
4. For email templates that open on another device, use the token-hash callback rather than relying on the initiating browser’s PKCE verifier. Confirmation link: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`. Recovery link: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`. Keep Supabase’s OTP protections enabled.
5. Enable Google OAuth in Supabase. Configure the Google provider’s client ID/secret in Supabase and use the Supabase-provided OAuth redirect in Google Cloud. Application OAuth returns through `/auth/callback`.
6. Generate separate random values for `SESSION_HASH_SECRET` and `CRON_SECRET` using `openssl rand -hex 32`; keep both server-side.

Keep `.env.example` blank: it is a shareable template. Use the Supabase server secret key (new `sb_secret_...` format) or legacy service-role key for `SUPABASE_SERVICE_ROLE_KEY`. After configuring the project, run this read-only check:

```sh
npm run check:supabase
# To select the Next.js configuration explicitly:
npm run check:supabase -- .env.local
```

The check verifies connectivity, the publishable key, server database access, schema markers from all migrations and seeded plans. It reports email confirmation and Google sign-in settings without printing credentials or reading business records. It does not apply SQL migrations or test interactive sign-in. If both local environment files exist, keep them synchronized when rotating keys and restart the development server.

New organizations atomically receive an owner membership and a 14-day Growth trial. RPCs enforce plan limits under database locks. RLS denies cross-tenant reads; managers only see assigned locations and cannot access billing, archive locations or delete a business. Public tables contain no customer narratives, model outputs or raw webhook bodies.

See [Supabase’s server-side client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client). Sessions are checked with `getUser`, with middleware refreshing cookies.

## Cashfree sandbox

Use a merchant account with **Subscriptions** enabled, not only one-time payment orders.

1. Configure sandbox client ID/secret and webhook signing secret. Keep `CASHFREE_ENVIRONMENT=sandbox`, `CASHFREE_LIVE_ENABLED=false`.
2. Set `APP_URL` to the exact application origin. Hosted callbacks and public printed QRs require an accessible HTTPS deployment; localhost is for local development only.
3. Register `https://YOUR_DOMAIN/api/v1/webhooks/cashfree` for subscription status, payment success/failure and refund events. Configure webhook version **2025-01-01**, matching the server adapter. Signatures are verified over timestamp plus exact raw request bytes; payloads are not stored. Webhook freshness is five minutes, so missed/old deliveries are recovered by API reconciliation.
4. Sign in as an owner, add a location, and open Billing. Select a plan, provide your billing name and Indian mobile number, confirm recurring billing, then open Cashfree’s hosted mandate checkout.
5. Verify sandbox authorization **does not grant paid access**. Only a confirmed `CHARGE` payment with the database-selected amount/currency does. The ₹1 authorization requests automatic refund; the first monthly debit is scheduled at the later of the trial end and 24 hours from checkout creation.
6. Test success, failure, duplicate delivery, missed webhook, cancellation before the first charge, and cancellation after payment. Run the maintenance/reconciliation job below and verify billing refresh.

Provider identifiers and payment references are stored, not card data. Cancellation retains access through the confirmed paid period. A renewal failure at/after period end can receive three days’ grace. Active-plan changes use cancellation and end-of-period replacement; there is no proration. Full refunds update payment history; refunds do not automatically change service terms. Partial refund automation and merchant-specific tax invoices remain merchant workflows.

INR monthly Starter ₹399/500 AI attempts/1 location; Growth ₹999/3,000/3; Business ₹2,999/10,000/10. USD catalog prices are indicative; Cashfree subscription checkout deliberately accepts only India/INR. Annual billing is outside the implemented monthly MVP.

Before production, complete Cashfree merchant approval and sandbox checks, publish your operator identity, contact, refund policy and tax/invoice treatment, then switch to production credentials and set `CASHFREE_LIVE_ENABLED=true`. Live payments are disabled by default.

Sources: [hosted subscription checkout](https://www.cashfree.com/docs/payments/subscription/hosted-checkout), [create subscription](https://www.cashfree.com/docs/api-reference/payments/latest/subscription/create-subscription), [webhook signatures](https://www.cashfree.com/docs/api-reference/payments/latest/subscription/webhook-signature), [event payloads](https://www.cashfree.com/docs/api-reference/payments/latest/subscription/webhooks), [official SDK API contracts, including payment reconciliation](https://github.com/cashfree/cashfree-pg-sdk-nodejs/blob/main/api.ts).

## AI assistance — Gemini or OpenAI

Selecting stars automatically creates four English/Hindi review options using the saved business name/category, the customer's overall rating and optional experience details. The customer browses a swipeable carousel with previous/next arrows, selects one, then edits and copies it directly inside that card. No second editor form opens. Optional one-tap experience highlights and a collapsed details field keep the flow short. Stars guide tone; generated wording never spells out scores such as “4 out of 5” or “four stars”. Customer-provided experience numbers, such as wait times, are preserved. These are alternative wordings for one review. Specific experience claims come only from the customer; business metadata identifies the business. Rapid rating changes are debounced, and late AI responses cannot overwrite a customer's choice or edit. The guest demo uses four local starter options. Live pages also keep starter options available when AI is disabled or unavailable.

For Gemini, enter `GEMINI_API_KEY` in your ignored local environment file, set `AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.5-flash-lite` and `AI_ENABLED=true`, then restart the app. Obtain your key through [Google AI Studio](https://aistudio.google.com/apikey). Update both `.env.local` and `.dev.vars` if you use both development frameworks. Never enter real keys in `.env.example`.

For OpenAI, use `AI_PROVIDER=openai`, `OPENAI_API_KEY` and an explicit `OPENAI_MODEL` supporting Responses JSON-schema outputs. Each batch uses one quota reservation, one generation call (with at most one re-roll if at least three options repeat the previous batch, and bounded JSON-format compatibility retries) and one conservative fact/sentiment verification call under a shared 15-second deadline. Each option is checked independently; three or four verified options are returned. If fewer than three pass, four local starters preserve the original details or overall rating. Provider failures refund organization quota; session attempts remain bounded to prevent retry abuse. The server loads the business profile from the active QR/session, never from customer-supplied fields. The public page only advertises AI availability when the selected provider is configured.


To diagnose Gemini locally, run `npm run check:ai -- .env.local` (or `.dev.vars` for Vinext). It sends one synthetic batch, bypassing Supabase/session quotas, and reports safe failure categories. On HTTP rejection the standalone check shows a redacted provider message; the application logs only fixed categories, connection codes and HTTP status, never provider messages or customer text. `network_code` identifies DNS, TLS and connection failures; `network_detail` categorizes Worker errors that omit a connection code (or reports `unclassified`); `provider_rejection` identifies key expiry, unsupported regions/fields and schema errors. The current `responseFormat.text.mimeType` field requires the `APPLICATION_JSON` enum, as documented in the [API reference](https://ai.google.dev/api/generate-content#TextResponseFormat). Older API deployments that explicitly reject the format field/enum get one compatibility retry using the previous JSON-schema fields under the same deadline. Keys, quota errors, invalid schemas and unrelated 400s are not retried.

Reputly never persists source or draft text and never logs request bodies. OpenAI requests use `store:false`; this is not a promise of zero provider-side retention. Google's unpaid Gemini API services may use inputs and outputs for product improvement and human review; paid-service data handling differs. Review [Gemini API terms](https://ai.google.dev/gemini-api/terms) or [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) for your selected provider. Gemini uses [structured JSON output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output); its default model follows the [current model catalog](https://ai.google.dev/gemini-api/docs/models). Optional `GEMINI_*_USD_PER_MILLION` / `OPENAI_*_USD_PER_MILLION` settings apply only to their respective provider's usage estimates.

## Google business profile lookup

Set `GOOGLE_PLACES_API_KEY` in `.env.local` for `dev:next`, or `.dev.vars` for the Sites preview, then restart. This server-only key needs **Places API (New)** enabled in your Google Cloud project; a Gemini key alone does not enable Places. The blank setting has been added to the local configuration and template.

When adding or editing a location, paste its official Google review link. After a short debounce, Reputly resolves the destination and loads available company information: name, category, address, editorial description, website, phone, opening hours and supported offerings. The preview displays Google Maps/provider attribution. Confirm the destination and maintain the business name/category in the location form. Profile responses stay in memory rather than being saved or cached; only the owner-provided location fields and confirmed review destination are stored.

During AI generation, the server fetches current company context using the saved destination, after reserving quota. Name/category/description/offerings guide vocabulary; stars, selected highlights and the customer's own details guide their experience. Other customers' reviews and aggregate Google ratings are not requested. Missing or unavailable Places configuration falls back to saved business details. Fresh batches receive a variation ID and the previous options; repeated options are excluded, with one bounded re-roll for a mostly repeated batch. Calls share the existing deadline and reservation. All generated experience claims still require customer input.

The lookup uses a fixed field mask, not a request for every available field. Available details vary by listing; requested fields determine Google Maps billing. See [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details) and [Places data policies](https://developers.google.com/maps/documentation/places/web-service/policies).

## Teams and administration

Invitation links expire after seven days and require the intended verified email. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM` to send invitation emails; otherwise admins receive the link once to share themselves.

Set `PLATFORM_ADMIN_USER_IDS` to specific Supabase user UUIDs. `/admin` supports TOTP enrollment/verification; privileged reads and mutations require `aal2` and allowlisting. Suspensions/reactivations are audited. Drafts cannot be inspected because they are not retained.

## Maintenance, deletion and backup

Schedule authenticated `POST /api/v1/jobs/maintenance` with header `Authorization: Bearer YOUR_CRON_SECRET` every five minutes using your hosting scheduler. Never put the token in a URL. The job reconciles up to 20 subscriptions ordered by the oldest check; subsequent runs continue the rotation. A `207` response means some operations failed and should be retried. Export a workspace before requesting deletion.

Maintenance removes expired sessions after 48 additional hours, individual analytics and AI metadata after 90 days, daily aggregates and audit entries after 24 months, and obsolete limiter/idempotency/invitation records. Stale AI reservations refund quota. Scheduled business deletion disables access immediately and removes operational data after 30 days **only when all provider checkouts/mandates have been cancelled or confirmed nonexistent**. Account deletion also removes the Supabase identity after its administered businesses are cleared. Payment references remain in anonymized organizations for accounting; set a legally reviewed billing-retention process for your market.

Use Supabase backups/PITR appropriate to your project. Restore into an isolated project first, run the tenant tests, and reconcile payment state from Cashfree before switching traffic. Keep cron and live billing disabled on restored staging copies. See [operations and release checks](docs/operations.md).

## Hosting

The starter’s Sites/Vinext integration remains available:

```sh
npm run build
```

For the PRD’s standard Next.js/Vercel deployment, set framework to Next.js and override Build Command to:

```sh
npm run build:next
```

Set the server environment variables in Vercel, with `APP_URL=https://YOUR_DOMAIN`. The Next.js build produces `.next`; `npm run start:next` runs it locally. Configure your scheduler separately. Supabase service credentials must be runtime secrets. Cloudflare local builds may write ignored `.dev.vars` into `dist/server`; **never share or upload that file as a public artifact**. No application has been published from this workspace.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run build:next
npm run check:api
```

Compiled API checks verify unauthenticated access, CSRF rejection, invalid webhook signatures, untrusted checkout returns, four verified AI options using the database's business profile, and sanitized connection diagnostics. Provider/database responses in these checks are simulated; they make no external calls.

Database tests execute all migrations on actual PostgreSQL via PGlite, covering RLS, RPC permissions, quotas, payment deduplication, cancellation, invitations and deletion. Security tests cover raw signatures, redirects, origin checks, body limits and event forgery. They do not contact live providers.

Browser scenarios are in `tests/e2e/`. To run locally outside the restricted coding sandbox:

```sh
npx playwright install chromium
npm run dev -- --port 4173
# In a separate terminal:
npm run test:e2e
```

Browser launch, device-scanning QA, accessibility audits against the rendered app, live email/OAuth and Cashfree sandbox round trips must be completed in your configured environment. They are not claimed as passed by the local unit/database suite.

## Managed NFC review tags

Apply `supabase/migrations/202610150001_nfc_channels.sql` after the existing migrations before running this version against a live database. Existing QR codes remain QR links. Open `/app/nfc`, choose an active location, and register one tag per physical chip with a name and optional placement. Owners and assigned location managers share the existing RLS permissions. Creation, edits and pause actions are audited. Each location supports up to 500 combined QR/NFC links; creation is serialized and retries are idempotent.

Choose **Program chip** to write the stable HTTPS URL as an NDEF URL record. Browser writing requires a compatible NFC-enabled Android device with Chrome, a secure top-level page, user permission, and a writable NDEF chip. It defaults to refusing to overwrite existing content. Replacement requires an explicit checkbox; the app never permanently locks a chip. Writing can be cancelled and times out after one minute. Other devices can copy the URL into an NFC writing app and download a fallback QR. See [Chrome’s Web NFC documentation](https://developer.chrome.com/docs/capabilities/nfc).

Test the chip on another phone before placing it with customers. Updating the location’s Google destination keeps the written URL stable; pausing a tag disables its customer page and new session events. A public URL is shareable and clonable: this feature does not authenticate a physical chip. The Analytics channel filter separates registered NFC links from QR links, but copied URLs and fallback QR scans also count as NFC-link opens. No hardware UID or customer identity is collected.

## Ingress and release hardening

Set `TRUSTED_PROXY=cloudflare` only behind a Cloudflare ingress that overwrites `CF-Connecting-IP`, or `TRUSTED_PROXY=vercel` on Vercel where `X-Forwarded-For` is overwritten. Prevent direct access around the trusted ingress. With no trusted proxy configured, public traffic shares a conservative limiter bucket; arbitrary client forwarding headers cannot create unlimited buckets. See [Vercel request headers](https://vercel.com/docs/headers/request-headers). MFA enrollment and verification also have application throttling. Production responses include HSTS; NFC permission is restricted to the same origin.

`npm run test:e2e` starts an isolated Vite workspace fixture on port 4180 in addition to the app. It mounts the real workspace components with mocked API responses, covers NFC registration/edit/pause, simulated writing/cancellation, fallback QR downloads, responsive layout and accessibility. The fixture is outside `app/` and is not an application auth bypass. Database tests separately run the actual migrations and RLS checks. Physical chip writing, live sign-in and deployed ingress configuration still require release acceptance checks.
