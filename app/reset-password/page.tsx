import AuthForm from "@/components/auth-form";
import { configured } from "@/lib/server/config";
export default async function Reset({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const q = await searchParams;
  return (
    <AuthForm mode={q.request ? "reset" : "password"} enabled={configured()} />
  );
}
