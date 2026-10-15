import { sessionClient } from "@/lib/server/supabase";
import { appOrigin, safeReturnPath } from "@/lib/server/config";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await sessionClient();
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  let success = false;
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    success = !error;
  } else if (
    hash &&
    ["email", "signup", "recovery", "invite"].includes(type || "")
  ) {
    const { error } = await db.auth.verifyOtp({
      token_hash: hash,
      type: type as "email" | "signup" | "recovery" | "invite",
    });
    success = !error;
  }
  return Response.redirect(
    `${appOrigin()}${success ? safeReturnPath(url.searchParams.get("next"), type === "recovery" ? "/reset-password" : "/app") : "/login?error=verification"}`,
    303,
  );
}
