# NFC and workspace hardening — 15 October 2026

## Delivered

- `/app/nfc`: register, search, edit, program, preview, pause and reactivate location-scoped NFC review tags. Stable HTTPS links, NDEF URL writing, explicit overwrite consent, cancellation, one-minute timeout, permission errors and copy/QR fallback.
- Database-backed channel and placement fields on existing customer links. Existing QR links are preserved. RLS, location assignments, audit entries and revocation apply to NFC tags. Serialized creation, bounded inventory and request idempotency prevent duplicate registrations and uncontrolled growth.
- Analytics channel filtering distinguishes QR links from registered NFC links. It measures link activity, not verified hardware taps or published Google reviews.
- Readable workspace typography, larger controls, reflowing filters, keyboard focus, mobile navigation focus containment, controlled error screens and clearer network failures. Review carousel arrows handle rapid navigation. QR location selection has an explicit accessible name.
- Trusted-ingress rate-limit identities, MFA mutation throttling, exact JSON media-type checks, stricter application origin validation, a constrained maintenance-job route and production HSTS.
- Next.js upgraded to 16.4.1 with matching lint rules; compatible transitive updates applied. Production dependency audit reports zero known vulnerabilities at verification time.

## Enable on an existing installation

1. Back up the database and apply `supabase/migrations/202610150001_nfc_channels.sql` after the three earlier migrations. This workspace change does not apply migrations to a remote database.
2. Deploy the updated application with `APP_URL` set to the public HTTPS origin. NFC writing rejects HTTP destinations.
3. Configure `TRUSTED_PROXY=cloudflare` or `TRUSTED_PROXY=vercel` only for the ingress actually protecting the origin. Without this setting, anonymous traffic shares one conservative rate-limit bucket. Block access around the trusted ingress.
4. Activate a location with a confirmed Google review destination, then add a tag in `/app/nfc`. Write its URL using a compatible browser or NFC writing app.
5. Test a real chip with a second phone, test its fallback QR, change the location destination, and pause/reactivate the tag. Confirm the public flow and analytics before distributing tags.

## Verification and limits

Unit/database tests execute all SQL migrations in PGlite and verify tenant isolation, assigned-manager access, pause behavior, idempotency, immutable channels and input limits. Browser tests mount the real workspace in a separate Vite fixture with mocked API responses. They simulate Web NFC and test registration, edits, search, pause, cancellation, fallback downloads, desktop/mobile layout and WCAG A/AA checks. They do not prove physical NFC compatibility or live-provider behavior.

The existing production setup still needs live authentication, email, payment, ingress and backup/restore acceptance checks. NFC tags encode shareable URLs, not tamper-proof hardware identities. No SSO/SCIM, compliance certification or load-test capacity is claimed.

The full development/build-tool audit still identifies advisories in the legacy Vinext/Cloudflare/Drizzle toolchain and related packages. npm suggests some breaking changes or downgrades; these were not force-applied. Keep development servers private and plan a tested toolchain upgrade before using that stack for an enterprise release. The clean production audit applies to `npm audit --omit=dev`, not the full dependency tree. The current CSP retains inline-script compatibility; nonce-based CSP remains a separate hardening task across both runtimes.

Run the Next.js and Vinext builds sequentially: both generate files under `.next/types`. Lint passes with existing warnings (unused imports and effect-dependency guidance). Physical hardware tests and deployment validation remain pending.

### Recorded local results

- 118 unit/database tests passed.
- 32 browser tests passed across desktop Chromium and a mobile viewport, including NFC and customer-flow accessibility scans.
- Type checking passed; lint completed with zero errors and 22 warnings.
- Next.js 16.4.1 production build and Sites/Vinext production build passed (run sequentially).
- Compiled API smoke/security checks passed without contacting external providers.
- Production-only dependency audit: zero known vulnerabilities.
- Desktop/mobile NFC screenshots: `outputs/nfc-chromium.png` and `outputs/nfc-mobile.png` (local, ignored artifacts).
