# Operations and release checks

## Release evidence

Run type checking, all local tests and both supported builds. CI also runs browser tests with mocked public service responses. These cover UI behavior without making provider calls; account and billing end-to-end acceptance needs configured staging services.

Before enabling live billing, exercise email signup/verification/reset on another device, Google OAuth, two separate owner tenants, an assigned manager and a removed manager. Confirm protected endpoints return 401 for an absent session, 403 for manager billing, and no cross-tenant resources. Run Cashfree sandbox mandate/charge/cancel scenarios and replay a signed duplicate webhook. Validate AI with positive, mixed and negative EN/HI sources, unknown names, numeric facts, prompt injection and unavailable-provider responses. Scan downloaded PNG/SVG and printed cards with real iOS/Android devices. Use axe and keyboard-only navigation on the guest, authenticated and public paths.

## Observability

Server error messages use structured `request_id`, `code` and coarse route name. Do not attach bodies, narratives, cookies, authorization headers, token-hash URLs or secret values to logging/monitoring tools. Track request latency/error rate, AI reservation outcome counts, oldest reconciliation timestamp and cron failures. Ensure the ingress proxy replaces trusted client IP headers; forwarding user-controlled values defeats address-based throttling. Anonymous-session limits and organization quotas provide additional independent bounds.

Event aggregates are approximate: per-session/type five-minute dedupe, rotating address hashes, and rate limits are abuse protections, not proof of unique humans. There is no Google review publication tracking. Tokens expire after 24 hours. Suspended/archived resources are checked again on events, AI calls and handoffs.

## Billing incidents

Start with payment references and safe event metadata, never card information. Run an owner Billing refresh or the cron to reconcile subscription status and all successful/failed recurring payment records from Cashfree. Deduplication uses both event fingerprints and provider payment IDs. Amount/currency must match the server catalog. Authorization never grants access. Provider timestamps without offsets are interpreted as IST; accounting periods are UTC.

Full refund confirmations update history; partial refunds and service-period adjustments need the merchant's explicit policy. Do not edit database entitlements from the browser or infer success from return URL parameters. Corrections should use verified provider records, with an audited server operation. Existing admin UI supports suspension/reactivation and diagnosis; arbitrary manual billing overrides are intentionally not exposed.

## Deletion incidents

If a due organization remains, inspect its checkouts and provider cancellation state. Provider failures prevent destructive cleanup and should be retried. Pending checkout creation can have timed out after provider creation, so do not assume an empty session ID means there is no mandate. Only a confirmed provider 404 permits closing an abandoned pending checkout. Completed deletions retain an anonymized organization shell for payment references. Account identity removal waits until owned organizations have been cleared. Restoration requests during the 30-day window require an audited operator procedure; self-service restoration is not offered.

## Backups and secrets

Separate staging and production projects/keys. Enable encrypted backups/PITR in Supabase and test restoration. Restored staging must not charge mandates or run production cleanup. Apply future schema changes as new migrations; do not reapply initial migrations to a live database. Rotate keys in provider dashboards, update runtime secrets, and remove old values. Never send `.env.local`, `.dev.vars`, server build secret files or authenticated browser storage with a support bundle.

## Product decisions still owned by the founder

Public operator identity and support contact; refund/service-period policy; India tax/invoice treatment; legal billing retention; live Cashfree eligibility; AI model/cost budget; public hosting/domain; Google link formats beyond the supported allowlist; performance/availability targets validated by monitoring. Guest access exposes sample workflows, not private business data, credentials or server source. It cannot prevent someone copying a visible product concept.
