import AuthForm from "@/components/auth-form";
import { configured } from "@/lib/server/config";
export const dynamic = "force-dynamic";
export default function Login() {
  return <AuthForm mode="login" enabled={configured()} />;
}
