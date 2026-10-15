import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requiredEnv, ApiError } from "./config";
export async function sessionClient() {
  const jar = await cookies();
  return createServerClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_PUBLISHABLE_KEY"),
    {
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) =>
              jar.set(name, value, {
                ...options,
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
              }),
            );
          } catch {
            /* Server components cannot write. Middleware refreshes before rendering. */
          }
        },
      },
    },
  );
}
export function serviceClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
      },
    },
  );
}
export async function authenticated() {
  const db = await sessionClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    throw new ApiError("AUTH_REQUIRED", 401, "Sign in to continue.");
  if (!user.email_confirmed_at)
    throw new ApiError(
      "EMAIL_NOT_VERIFIED",
      403,
      "Verify your email before creating a business workspace.",
    );
  return { db, user };
}
export async function authorized(orgId: string, admin = false) {
  const auth = await authenticated();
  const { data: member } = await auth.db
    .from("organization_members")
    .select("role,organizations!inner(status)")
    .eq("organization_id", orgId)
    .eq("user_id", auth.user.id)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (!member)
    throw new ApiError(
      "TENANT_ACCESS_DENIED",
      404,
      "The resource was not found.",
    );
  if (admin && member.role !== "organization_admin")
    throw new ApiError(
      "ROLE_REQUIRED",
      403,
      "Only a workspace admin can do this.",
    );
  return {
    ...auth,
    role: member.role as "organization_admin" | "location_manager",
  };
}
