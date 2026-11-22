import SupabaseRuntimeConfig from "../../../components/supabase-runtime-config";
import { getSupabaseConfig } from "../../../lib/supabase/config";
import ResetPasswordForm from "./reset-password-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  const supabaseConfig = getSupabaseConfig();
  return (
    <>
      <SupabaseRuntimeConfig url={supabaseConfig.url} publishableKey={supabaseConfig.publishableKey} />
      <ResetPasswordForm />
    </>
  );
}
