import { z } from "zod";
import { checkoutSchema, type Plan } from "@/lib/contracts";
import { ApiError, requiredEnv, appOrigin, dbError } from "./config";
import { serviceClient, authorized } from "./supabase";
import { constantTimeEqual, hmacBase64, sha256 } from "./crypto";
export function cashfreeMode() {
  const mode = requiredEnv("CASHFREE_ENVIRONMENT");
  if (mode !== "sandbox" && mode !== "production")
    throw new ApiError(
      "SERVICE_NOT_CONFIGURED",
      503,
      "Payment environment is not configured.",
    );
  if (mode === "production" && process.env.CASHFREE_LIVE_ENABLED !== "true")
    throw new ApiError(
      "BILLING_DISABLED",
      503,
      "Live billing is not enabled yet.",
    );
  return mode;
}
async function providerRequest(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  const mode = cashfreeMode();
  const response = await fetch(
    `https://${mode === "sandbox" ? "sandbox" : "api"}.cashfree.com/pg${path}`,
    {
      method,
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
      headers: {
        "x-client-id": requiredEnv("CASHFREE_CLIENT_ID"),
        "x-client-secret": requiredEnv("CASHFREE_CLIENT_SECRET"),
        "x-api-version": "2025-01-01",
        "Content-Type": "application/json",
        ...(key ? { "x-idempotency-key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  if (response.status === 404)
    throw new ApiError(
      "PAYMENT_NOT_FOUND",
      404,
      "Cashfree subscription was not found.",
    );
  if (!response.ok)
    throw new ApiError(
      "PAYMENT_PROVIDER_UNAVAILABLE",
      503,
      "Cashfree could not complete this request. Please try again.",
    );
  return response.json();
}
export async function cashfreeRequest(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  return z
    .record(z.unknown())
    .parse(await providerRequest(path, method, body, key));
}
export async function createCheckout(
  orgId: string,
  input: unknown,
  key: string,
) {
  const body = checkoutSchema.parse(input);
  const { db, user } = await authorized(orgId, true);
  cashfreeMode();
  const { data: plan, error } = await db
    .from("plans")
    .select("*")
    .eq("code", body.plan_code)
    .eq("currency", "INR")
    .eq("is_active", true)
    .single();
  dbError(error);
  const { data: org } = await db
    .from("organizations")
    .select("country_code")
    .eq("id", orgId)
    .single();
  if (org?.country_code !== "IN")
    throw new ApiError(
      "MARKET_NOT_SUPPORTED",
      422,
      "Cashfree subscription checkout is currently enabled for India in INR.",
    );
  const admin = serviceClient();
  const providerId = `rp_${(await sha256(orgId + key)).slice(0, 35)}`;
  const { data: prepared, error: prepareError } = await admin.rpc(
    "prepare_checkout",
    { p_org: orgId, p_plan: plan!.id, p_key: key, p_external: providerId },
  );
  dbError(prepareError);
  const row = prepared as {
    id: string;
    subscription_session_id: string | null;
    provider_subscription_id: string;
    status: string;
    plan_id: string;
  };
  if (row.plan_id !== plan!.id)
    throw new ApiError(
      "IDEMPOTENCY_CONFLICT",
      409,
      "Use a new idempotency key for a different plan.",
    );
  if (["active", "cancelled"].includes(row.status))
    throw new ApiError(
      "BILLING_PAYMENT_PENDING",
      409,
      "This checkout has already completed or been cancelled.",
    );
  let sessionId = row.subscription_session_id;
  if (!sessionId) {
    const billing = await db
      .from("subscriptions")
      .select("trial_ends_at")
      .eq("organization_id", orgId)
      .single();
    const firstCharge = new Date(
      Math.max(
        Date.now() + 24 * 3600_000,
        Date.parse(billing.data?.trial_ends_at || "") || 0,
      ),
    ).toISOString();
    const result = await cashfreeRequest(
      "/subscriptions",
      "POST",
      {
        subscription_id: row.provider_subscription_id,
        customer_details: {
          customer_name: body.customer_name,
          customer_email: user.email,
          customer_phone: body.customer_phone,
        },
        plan_details: {
          plan_name: `Reputly ${plan!.name}`,
          plan_type: "PERIODIC",
          plan_amount: plan!.amount_minor / 100,
          plan_max_amount: plan!.amount_minor / 100,
          plan_max_cycles: 120,
          plan_intervals: 1,
          plan_currency: "INR",
          plan_interval_type: "MONTH",
          plan_note: `Reputly ${plan!.name} monthly subscription`,
        },
        authorization_details: {
          authorization_amount: 1,
          authorization_amount_refund: true,
          payment_methods: ["upi", "card", "enach"],
        },
        subscription_meta: {
          return_url: `${appOrigin()}/api/v1/billing/return`,
          session_id_expiry: new Date(Date.now() + 24 * 3600_000).toISOString(),
        },
        subscription_first_charge_time: firstCharge,
        subscription_tags: { reputly_org: orgId },
      },
      row.id,
    );
    sessionId = z.string().min(10).parse(result.subscription_session_id);
    const { error: updateError } = await admin
      .from("checkout_requests")
      .update({ subscription_session_id: sessionId, status: "ready" })
      .eq("id", row.id);
    dbError(updateError);
    await admin.rpc("audit_mutation", {
      p_actor: user.id,
      p_org: orgId,
      p_action: "checkout_created",
      p_type: "checkout",
      p_id: row.id,
    });
  }
  return {
    subscription_session_id: sessionId,
    subscription_id: row.provider_subscription_id,
    environment: cashfreeMode(),
  };
}
export async function verifyWebhook(
  raw: string,
  signature: string | null,
  timestamp: string | null,
  secret: string,
  now = Date.now(),
) {
  if (!signature || !timestamp || !/^\d{10,13}$/.test(timestamp)) return false;
  const ms = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);
  if (!Number.isFinite(ms) || Math.abs(now - ms) > 5 * 60_000) return false;
  return constantTimeEqual(
    await hmacBase64(secret, timestamp + raw),
    signature,
  );
}
const eventSchema = z.object({
  type: z.string().max(100),
  event_time: z.string().datetime({ offset: true }),
  data: z.record(z.unknown()),
});
export function normalizeCashfreeEvent(raw: unknown) {
  const e = eventSchema.parse(raw);
  const d = e.data;
  const details =
    z.record(z.unknown()).optional().parse(d.subscription_details) || {};
  const external = String(d.subscription_id || details.subscription_id || "");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(external))
    throw new ApiError(
      "WEBHOOK_INVALID",
      400,
      "Invalid subscription reference.",
    );
  const status = String(d.payment_status || details.subscription_status || "");
  const amount = Number(d.payment_amount);
  return {
    type: e.type,
    external,
    status,
    payment: d.cf_payment_id ? String(d.cf_payment_id) : null,
    amount: Number.isFinite(amount) ? Math.round(amount * 100) : null,
    currency:
      typeof d.payment_currency === "string" ? d.payment_currency : null,
    paidAt: e.event_time,
    paymentType: typeof d.payment_type === "string" ? d.payment_type : null,
  };
}
export async function processWebhook(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError("WEBHOOK_INVALID", 400, "Invalid JSON payload.");
  }
  const type = (parsed as { type?: string })?.type;
  if (type === "SUBSCRIPTION_REFUND_STATUS") {
    const refund = z
      .object({
        data: z.object({
          cf_payment_id: z.string(),
          refund_status: z.string(),
          refund_amount: z.number(),
        }),
        event_time: z.string().datetime({ offset: true }),
      })
      .parse(parsed);
    const db = serviceClient();
    const { data: payment } = await db
      .from("payment_records")
      .select("organization_id,subscription_id")
      .eq("provider_payment_id", refund.data.cf_payment_id)
      .maybeSingle();
    if (!payment) return { received: true, ignored: true };
    const { data: subscription } = await db
      .from("subscriptions")
      .select("provider_subscription_id")
      .eq("id", payment.subscription_id)
      .maybeSingle();
    if (!subscription?.provider_subscription_id)
      return { received: true, ignored: true };
    return applyProviderEvent(
      {
        type,
        external: subscription.provider_subscription_id,
        status: refund.data.refund_status,
        payment: refund.data.cf_payment_id,
        amount: Math.round(refund.data.refund_amount * 100),
        currency: null,
        paidAt: refund.event_time,
        paymentType: null,
      },
      await sha256(raw),
    );
  }
  const e = normalizeCashfreeEvent(parsed);
  return applyProviderEvent(e, await sha256(raw));
}
async function applyProviderEvent(
  e: ReturnType<typeof normalizeCashfreeEvent>,
  eventId: string,
  verifiedProvider?: Record<string, unknown>,
) {
  const admin = serviceClient();
  const { data: known } = await admin
    .from("checkout_requests")
    .select("id")
    .eq("provider_subscription_id", e.external)
    .maybeSingle();
  if (!known) return { received: true, ignored: true };
  const provider =
    verifiedProvider ||
    (await cashfreeRequest(`/subscriptions/${encodeURIComponent(e.external)}`));
  if (provider.subscription_id !== e.external)
    throw new ApiError("WEBHOOK_INVALID", 400, "Subscription does not match.");
  const { data, error } = await admin.rpc("apply_billing_event", {
    p_event: eventId,
    p_type: e.type,
    p_external: e.external,
    p_status:
      e.type === "SUBSCRIPTION_STATUS_CHANGED"
        ? provider.subscription_status
        : e.status,
    p_payment: e.payment,
    p_amount: e.amount,
    p_currency: e.currency,
    p_paid_at: e.paidAt,
    p_payment_type: e.paymentType,
  });
  dbError(error);
  return { received: true, processed: Boolean(data) };
}
export async function cancelSubscription(orgId: string) {
  const { db, user } = await authorized(orgId, true);
  const { data: s, error } = await db
    .from("subscriptions")
    .select("*")
    .eq("organization_id", orgId)
    .single();
  dbError(error);
  const admin = serviceClient();
  const { data: pending, error: pendingError } = await admin
    .from("checkout_requests")
    .select("provider_subscription_id")
    .eq("organization_id", orgId)
    .in("status", ["pending", "ready", "active"]);
  dbError(pendingError);
  const refs = new Set<string>(
    (pending || []).map((r) => r.provider_subscription_id),
  );
  if (s?.provider_subscription_id) refs.add(s.provider_subscription_id);
  if (!refs.size)
    throw new ApiError(
      "NO_SUBSCRIPTION",
      409,
      "There is no subscription to cancel.",
    );
  for (const ref of refs) {
    await cashfreeRequest(
      `/subscriptions/${encodeURIComponent(ref)}/manage`,
      "POST",
      { subscription_id: ref, action: "CANCEL" },
    );
    await reconcileSubscription(ref);
  }
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({ cancel_requested_at: new Date().toISOString() })
    .eq("id", s!.id);
  dbError(updateError);
  const { error: auditError } = await admin.rpc("audit_mutation", {
    p_actor: user.id,
    p_org: orgId,
    p_action: "cancellation_requested",
    p_type: "subscription",
    p_id: s!.id,
  });
  dbError(auditError);
  return {
    status: "cancellation_requested",
    message:
      "Cancellation requested. Paid access remains until the confirmed period ends.",
  };
}
export function providerTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const iso = value.replace(" ", "T");
  const stamped = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "+05:30";
  return Number.isFinite(Date.parse(stamped))
    ? new Date(stamped).toISOString()
    : null;
}
export async function reconcileSubscription(external: string) {
  const p = await cashfreeRequest(
    `/subscriptions/${encodeURIComponent(external)}`,
  );
  if (p.subscription_id !== external)
    throw new ApiError(
      "PAYMENT_PROVIDER_UNAVAILABLE",
      503,
      "Subscription could not be reconciled.",
    );
  const payments = z
    .array(z.record(z.unknown()))
    .parse(
      await providerRequest(
        `/subscriptions/${encodeURIComponent(external)}/payments`,
      ),
    );
  const details = z.record(z.unknown()).parse(p.plan_details || {});
  const currency =
    typeof details.plan_currency === "string" ? details.plan_currency : null;
  for (const payment of payments) {
    if (
      payment.subscription_id !== external ||
      payment.payment_type !== "CHARGE"
    )
      continue;
    const status = String(payment.payment_status);
    if (!["SUCCESS", "FAILED"].includes(status)) continue;
    const paidAt = providerTimestamp(payment.payment_initiated_date);
    if (!paidAt) continue;
    const cfId = String(payment.cf_payment_id || "");
    if (!cfId) continue;
    await applyProviderEvent(
      {
        type:
          status === "SUCCESS"
            ? "SUBSCRIPTION_PAYMENT_SUCCESS"
            : "SUBSCRIPTION_PAYMENT_FAILED",
        external,
        status,
        payment: cfId,
        amount: Number.isFinite(Number(payment.payment_amount))
          ? Math.round(Number(payment.payment_amount) * 100)
          : null,
        currency,
        paidAt,
        paymentType: "CHARGE",
      },
      "reconcile-payment:" + (await sha256(external + cfId + status)),
      p,
    );
  }
  await applyProviderEvent(
    {
      type: "SUBSCRIPTION_STATUS_CHANGED",
      external,
      status: String(p.subscription_status),
      payment: null,
      amount: null,
      currency: null,
      paidAt: new Date().toISOString(),
      paymentType: null,
    },
    `reconcile:${external}:${String(p.subscription_status)}`,
    p,
  );
  const { error } = await serviceClient()
    .from("subscriptions")
    .update({ last_reconciled_at: new Date().toISOString() })
    .eq("provider_subscription_id", external);
  dbError(error);
  const { error: checkoutError } = await serviceClient()
    .from("checkout_requests")
    .update({ last_reconciled_at: new Date().toISOString() })
    .eq("provider_subscription_id", external);
  dbError(checkoutError);
  return { status: p.subscription_status };
}
