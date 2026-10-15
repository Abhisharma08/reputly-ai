import { z } from "zod";
import {
  orgSchema,
  locationSchema,
  locationPatch,
  qrSchema,
  qrPatch,
  inviteSchema,
  uuid,
} from "@/lib/contracts";
import { authenticated, authorized, serviceClient } from "./supabase";
import { dbError, ApiError, appOrigin } from "./config";
import { resolveReviewUrl } from "./review-url";
import { opaqueToken, sha256 } from "./crypto";
import { sendInvitation } from "./email";
export async function memberships() {
  const { db, user } = await authenticated();
  const { data, error } = await db
    .from("organization_members")
    .select("organization_id,user_id,role,accepted_at,organizations!inner(*)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null);
  dbError(error);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: String(
        user.user_metadata?.display_name || user.email?.split("@")[0] || "",
      ),
    },
    memberships: z
      .array(
        z.object({
          organization_id: uuid,
          user_id: uuid,
          role: z.enum(["organization_admin", "location_manager"]),
          accepted_at: z.string(),
          organizations: z.object({
            id: uuid,
            name: z.string(),
            country_code: z.string(),
            default_locale: z.string(),
            status: z.enum(["active", "suspended", "deleting"]),
            created_at: z.string(),
          }),
        }),
      )
      .parse(data || []),
  };
}
export async function createOrg(input: unknown, key: string) {
  const body = orgSchema.parse(input);
  const { db } = await authenticated();
  const { data, error } = await db.rpc("create_organization", {
    p_name: body.name,
    p_country: body.country_code,
    p_locale: body.default_locale,
    p_key: key,
  });
  dbError(error);
  return { id: data };
}
export async function snapshot(orgId: string) {
  const { db, role } = await authorized(orgId);
  const queries = [
    db.from("organizations").select("*").eq("id", orgId).single(),
    db
      .from("locations")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at"),
    (async () => {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await db.from("qr_codes").select("*").eq("organization_id", orgId).order("created_at").order("id").range(offset, offset + 999);
        if (page.error) return page;
        rows.push(...(page.data || []));
        if ((page.data?.length || 0) < 1000) return { data: rows, error: null };
        if (offset >= 19000) throw new ApiError("WORKSPACE_TOO_LARGE", 422, "Use the paginated links API for this workspace.");
      }
    })(),
  ];
  const results = await Promise.all(queries);
  results.forEach((r) => dbError(r.error));
  return {
    organization: results[0].data,
    locations: results[1].data,
    codes: results[2].data,
    public_base_url: appOrigin(),
    role,
  };
}
export async function saveLocation(
  orgId: string,
  id: string | null,
  input: unknown,
  key: string | null,
) {
  const { db } = await authorized(orgId, id === null);
  if (id) uuid.parse(id);
  const body = id ? locationPatch.parse(input) : locationSchema.parse(input);
  if (body.google_review_url) {
    body.google_review_url = await resolveReviewUrl(body.google_review_url);
    if (!body.destination_confirmed)
      throw new ApiError(
        "INVALID_REVIEW_URL",
        422,
        "Preview and confirm the Google destination before saving it.",
      );
  }
  if (body.status === "active" && body.google_review_url === "")
    throw new ApiError(
      "INVALID_REVIEW_URL",
      422,
      "An active location needs a confirmed Google review destination.",
    );
  const { data, error } = await db.rpc("upsert_location", {
    p_org: orgId,
    p_id: id,
    p_values: body,
    p_key: key,
  });
  dbError(error);
  const saved = await db
    .from("locations")
    .select("*")
    .eq("id", data)
    .eq("organization_id", orgId)
    .single();
  dbError(saved.error);
  return saved.data;
}
export async function saveQR(
  orgId: string,
  id: string | null,
  input: unknown,
  key: string | null,
) {
  const { db } = await authorized(orgId);
  const body = id ? qrPatch.parse(input) : qrSchema.parse(input);
  if (id) uuid.parse(id);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.rpc("upsert_qr", {
      p_org: orgId,
      p_id: id,
      p_values: body,
      p_key: key,
      p_slug: opaqueToken().slice(0, 32),
    });
    if (error?.code === "23505" && attempt < 2) continue;
    dbError(error);
    const qr = await db
      .from("qr_codes")
      .select("*")
      .eq("id", data)
      .eq("organization_id", orgId)
      .single();
    dbError(qr.error);
    return { ...qr.data, url: `${appOrigin()}/r/${qr.data!.slug}` };
  }
  throw new ApiError(
    "CONFLICT",
    409,
    "Could not create a unique QR. Try again.",
  );
}
export async function analytics(orgId: string, query: URLSearchParams) {
  const { db } = await authorized(orgId);
  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
      "Use a valid calendar date",
    );
  const from = date.parse(query.get("from"));
  const to = date.parse(query.get("to"));
  if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400_000)
    throw new ApiError(
      "INVALID_DATE_RANGE",
      422,
      "Choose a date range of up to one year.",
    );
  const location = query.get("location_id");
  if (location) uuid.parse(location);
  const channel = z.enum(["qr", "nfc"]).optional().parse(query.get("channel") || undefined);
  const rows: unknown[] = [];
  for (let offset = 0; offset < 200000; offset += 1000) {
    let q = db
      .from("analytics_daily")
      .select("location_id,day,event_type,event_count,qr_codes!inner(channel)")
      .eq("organization_id", orgId)
      .gte("day", from)
      .lte("day", to)
      .order("day")
      .order("qr_code_id")
      .order("event_type")
      .range(offset, offset + 999);
    if (location) q = q.eq("location_id", location);
    if (channel) q = q.eq("qr_codes.channel", channel);
    const { data, error } = await q;
    dbError(error);
    rows.push(...(data || []));
    if ((data?.length || 0) < 1000) break;
    if (offset === 199000)
      throw new ApiError(
        "REPORT_TOO_LARGE",
        422,
        "Choose a smaller reporting period.",
      );
  }
  return {
    rows,
    window: { from, to },
    data_freshness: new Date().toISOString(),
    attribution_note:
      "Google link clicks are handoffs, not confirmed published reviews.",
  };
}
export async function billing(orgId: string) {
  const { db } = await authorized(orgId, true);
  const [s, u, l, p, c] = await Promise.all([
    db
      .from("subscriptions")
      .select("*,plans(*)")
      .eq("organization_id", orgId)
      .single(),
    db
      .from("usage_counters")
      .select("ai_requests")
      .eq("organization_id", orgId)
      .eq("period_start", new Date().toISOString().slice(0, 7) + "-01")
      .maybeSingle(),
    db
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .neq("status", "archived"),
    db
      .from("payment_records")
      .select(
        "id,provider_payment_id,amount_minor,currency,status,paid_at,invoice_url",
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    serviceClient()
      .from("checkout_requests")
      .select("provider_subscription_id,plan_id,status")
      .eq("organization_id", orgId)
      .in("status", ["pending", "ready"])
      .limit(1),
  ]);
  [s, u, l, p, c].forEach((r) => dbError(r.error));
  return {
    subscription: s.data,
    usage: { ai_used: u.data?.ai_requests || 0, locations_used: l.count || 0 },
    payments: p.data,
    pending_checkout: c.data?.[0] || null,
    provider: "cashfree",
    checkout_enabled:
      !!process.env.CASHFREE_CLIENT_ID &&
      !!process.env.CASHFREE_CLIENT_SECRET &&
      (process.env.CASHFREE_ENVIRONMENT === "sandbox" ||
        process.env.CASHFREE_LIVE_ENABLED === "true"),
  };
}
export async function team(orgId: string) {
  const { db } = await authorized(orgId, true);
  const [m, i] = await Promise.all([
    db.rpc("team_directory", { p_org: orgId }),
    db
      .from("member_invitations")
      .select("id,email,role,location_ids,expires_at,accepted_at")
      .eq("organization_id", orgId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  dbError(m.error);
  dbError(i.error);
  return { members: m.data, invitations: i.data };
}
export async function invite(orgId: string, input: unknown) {
  const body = inviteSchema.parse(input);
  const { db } = await authorized(orgId, true);
  const token = opaqueToken();
  const { data, error } = await db.rpc("create_invitation", {
    p_org: orgId,
    p_email: body.email,
    p_hash: await sha256(token),
    p_locations: body.location_ids,
  });
  dbError(error);
  const link = `${appOrigin()}/invite?token=${token}`;
  const sent = await sendInvitation(body.email, link);
  return {
    id: data,
    email_sent: sent,
    ...(!sent ? { invitation_url: link } : {}),
  };
}
export async function exportOrg(orgId: string) {
  const { db } = await authorized(orgId, true);
  const tables = [
    "locations",
    "qr_codes",
    "analytics_daily",
    "organization_members",
  ] as const;
  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    organization_id: orgId,
    raw_review_text_retained: false,
  };
  for (const table of tables) {
    const all: unknown[] = [];
    for (let start = 0; start < 200000; start += 1000) {
      const { data, error } = await db
        .from(table)
        .select("*")
        .eq("organization_id", orgId)
        .order(
          table === "analytics_daily"
            ? "day"
            : table === "organization_members"
              ? "user_id"
              : "id",
        )
        .range(start, start + 999);
      dbError(error);
      all.push(...(data || []));
      if ((data?.length || 0) < 1000) break;
      if (start === 199000)
        throw new ApiError(
          "EXPORT_TOO_LARGE",
          422,
          "Contact support for an export at this size.",
        );
    }
    out[table] = all;
  }
  return out;
}
export async function updateOrg(orgId: string, input: unknown) {
  const body = z
    .object({
      name: z.string().trim().min(2).max(160).optional(),
      delete_requested: z.boolean().default(false),
      confirmation: z.string().optional(),
    })
    .strict()
    .parse(input);
  const { db } = await authorized(orgId, true);
  if (body.delete_requested && body.confirmation !== "DELETE")
    throw new ApiError(
      "DELETE_CONFIRMATION_REQUIRED",
      422,
      "Type DELETE to schedule removal.",
    );
  const { error } = await db.rpc("update_organization", {
    p_org: orgId,
    p_name: body.name || null,
    p_delete: body.delete_requested,
  });
  dbError(error);
  return {
    status: body.delete_requested ? "deletion_scheduled" : "updated",
    deletion_delay_days: body.delete_requested ? 30 : undefined,
  };
}
export async function listResource(
  orgId: string,
  table: "locations" | "qr_codes",
  query: URLSearchParams,
) {
  const { db } = await authorized(orgId);
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(query.get("limit") || 50);
  const cursor = query.get("cursor");
  if (cursor) uuid.parse(cursor);
  let q = db
    .from(table)
    .select("*")
    .eq("organization_id", orgId)
    .order("id")
    .limit(limit + 1);
  if (cursor) q = q.gt("id", cursor);
  const { data, error } = await q;
  dbError(error);
  const rows = data || [];
  return {
    items: rows.slice(0, limit),
    next_cursor: rows.length > limit ? rows[limit - 1].id : null,
  };
}
