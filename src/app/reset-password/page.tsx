import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/config";
import { authenticatedUser } from "@/lib/supabase";
import { hasRecovery } from "@/lib/recovery";

export default async function ResetPassword() {
  if (!configured()) redirect("/forgot-password");
  const auth = await authenticatedUser();
  if (!auth) redirect("/forgot-password");
  const claims = await auth.client.auth.getClaims();
  const sessionId = claims.data?.claims.session_id;
  if (
    typeof sessionId !== "string" ||
    !(await hasRecovery(auth.user.id, sessionId))
  )
    redirect("/forgot-password");
  return (
    <main id="main" className="narrow-page">
      <p className="section-label">Your account</p>
      <h1>Set a new password</h1>
      <p>
        Choose a password you have not used before. You’ll log in again after
        saving it.
      </p>
      <AuthForm mode="reset-password" draftUserId={auth.user.id} />
      <Link href="/login">Back to log in</Link>
    </main>
  );
}
