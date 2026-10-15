import { rateLimitIdentity } from "./request-security";
import { serviceClient } from "./supabase";
import { ApiError, dbError, requiredEnv } from "./config";
import { sha256, opaqueToken } from "./crypto";
import { resolveReviewUrl } from "./review-url";
export async function throttle(
  request: Request,
  scope: string,
  limit = 30,
  seconds = 60,
) {
  const ip = rateLimitIdentity(request);
  const hash = await sha256(
    requiredEnv("SESSION_HASH_SECRET") +
      new Date().toISOString().slice(0, 10) +
      scope +
      ip,
  );
  const { data, error } = await serviceClient().rpc("consume_rate_limit", {
    p_key: hash,
    p_seconds: seconds,
    p_limit: limit,
  });
  dbError(error);
  if (!data)
    throw new ApiError(
      "RATE_LIMITED",
      429,
      "Too many requests. Please try again in a minute.",
    );
}
export async function publicCode(slug: string) {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(slug))
    throw new ApiError("QR_INACTIVE", 404, "This QR code was not found.");
  const db = serviceClient();
  const { data: q, error } = await db
    .from("qr_codes")
    .select("id,organization_id,location_id,slug,label,brand_color,is_active")
    .eq("slug", slug)
    .maybeSingle();
  dbError(error);
  if (!q || !q.is_active)
    throw new ApiError("QR_INACTIVE", 410, "This QR code is inactive.");
  const { data: l } = await db
    .from("locations")
    .select(
      "id,name,category,country_code,locale,timezone,brand_color,google_review_url,status",
    )
    .eq("id", q.location_id)
    .eq("organization_id", q.organization_id)
    .maybeSingle();
  const { data: o } = await db
    .from("organizations")
    .select("status")
    .eq("id", q.organization_id)
    .maybeSingle();
  if (
    !l ||
    l.status !== "active" ||
    o?.status !== "active" ||
    !l.google_review_url
  )
    throw new ApiError("QR_INACTIVE", 410, "This QR code is inactive.");
  return { db, q, l };
}
export async function issueSession(slug: string) {
  const { db, q, l } = await publicCode(slug);
  const token = opaqueToken();
  const expires = new Date(Date.now() + 24 * 3600_000).toISOString();
  const { data: s, error } = await db
    .from("public_sessions")
    .insert({
      qr_code_id: q.id,
      token_hash: await sha256(token),
      expires_at: expires,
    })
    .select("id")
    .single();
  dbError(error);
  return {
    session_token: token,
    expires_at: expires,
    location: l.name,
    session_id: s!.id,
  };
}
export async function validSession(token: string) {
  const db = serviceClient();
  const { data: s, error } = await db
    .from("public_sessions")
    .select("id,qr_code_id,expires_at,ai_attempts")
    .eq("token_hash", await sha256(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  dbError(error);
  if (!s)
    throw new ApiError(
      "SESSION_EXPIRED",
      401,
      "Your session expired. Refresh and keep your original text.",
    );
  const { data: q } = await db
    .from("qr_codes")
    .select("slug")
    .eq("id", s.qr_code_id)
    .maybeSingle();
  if (!q) throw new ApiError("QR_INACTIVE", 410, "This QR code is inactive.");
  return { session: s, ...(await publicCode(q.slug)) };
}
export async function recordPublic(
  token: string,
  type: string,
  eventId: string,
) {
  const { db, session } = await validSession(token);
  const bucket = Math.floor(Date.now() / 300_000);
  const key = `${session.id}:${type}:${bucket}`;
  const { error } = await db.rpc("record_public_event", {
    p_session: session.id,
    p_type: type,
    p_key: key,
  });
  dbError(error);
  return { accepted: true, event_id: eventId };
}
export async function googleDestination(slug: string) {
  const { l } = await publicCode(slug);
  return { url: await resolveReviewUrl(l.google_review_url!) };
}
