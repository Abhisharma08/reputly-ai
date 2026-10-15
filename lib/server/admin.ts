import { authenticated, serviceClient } from "./supabase";
import { ApiError, dbError } from "./config";
export async function platformAdmin() {
  const auth = await authenticated();
  const allowed = (process.env.PLATFORM_ADMIN_USER_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!allowed.includes(auth.user.id))
    throw new ApiError(
      "TENANT_ACCESS_DENIED",
      404,
      "The resource was not found.",
    );
  const { data, error } =
    await auth.db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || data?.currentLevel !== "aal2")
    throw new ApiError(
      "MFA_REQUIRED",
      403,
      "Verify your authenticator to access administration.",
    );
  return { ...auth, admin: serviceClient() };
}
export async function adminOverview() {
  const { admin } = await platformAdmin();
  const results = await Promise.all([
    admin
      .from("organizations")
      .select("id,name,country_code,status,created_at,deletion_due_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("billing_events")
      .select("id,event_type,status,received_at,processed_at")
      .order("received_at", { ascending: false })
      .limit(30),
    admin
      .from("subscriptions")
      .select("organization_id,status,plan_id,trial_ends_at,current_period_end")
      .limit(100),
    admin
      .from("audit_logs")
      .select("id,action,entity_type,entity_id,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("usage_counters")
      .select("organization_id,period_start,ai_requests")
      .eq("period_start", new Date().toISOString().slice(0, 7) + "-01")
      .limit(100),
    admin
      .from("technical_errors")
      .select("request_id,route,error_code,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  results.forEach((r) => dbError(r.error));
  return {
    organizations: results[0].data,
    billing_events: results[1].data,
    subscriptions: results[2].data,
    audit_logs: results[3].data,
    usage: results[4].data,
    errors: results[5].data,
  };
}
