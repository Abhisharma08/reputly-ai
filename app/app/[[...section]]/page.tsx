
import Link from "next/link";
import { redirect } from "next/navigation";
import LiveWorkspace from "@/components/live-workspace";
import { memberships } from "@/lib/server/workspace";
import { configured, ApiError } from "@/lib/server/config";
import Brand from "@/components/brand";
export const dynamic = "force-dynamic";
export default async function AppPage({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  if (!configured())
    return (
      <div className="auth-page">
        <Brand />
        <section className="panel">
          <h1>Your application is ready to configure.</h1>
          <p>
            Follow the README to set local Supabase, Cashfree and OpenAI
            credentials and apply the database migrations.
          </p>
          <Link className="button primary full" href="/demo">
            Explore the guest demo
          </Link>
        </section>
      </div>
    );
  let identity;
  try {
    identity = await memberships();
  } catch (e) {
    if (
      e instanceof ApiError &&
      ["AUTH_REQUIRED", "EMAIL_NOT_VERIFIED"].includes(e.code)
    )
      redirect("/login");
    throw e;
  }
  const { section } = await params;
  return (
    <LiveWorkspace
      section={section?.[0] || "overview"}
      identity={
        identity as React.ComponentProps<typeof LiveWorkspace>["identity"]
      }
    />
  );
}
