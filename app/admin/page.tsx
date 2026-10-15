import AdminConsole from "@/components/admin-console";
import { redirect } from "next/navigation";
import { authenticated } from "@/lib/server/supabase";
import { configured, ApiError } from "@/lib/server/config";
export const dynamic = "force-dynamic";
export default async function Admin() {
  if (!configured()) redirect("/app");
  try {
    await authenticated();
  } catch (e) {
    if (e instanceof ApiError && e.code === "AUTH_REQUIRED") redirect("/login");
    throw e;
  }
  return <AdminConsole />;
}
