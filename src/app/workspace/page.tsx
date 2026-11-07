import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/config";
import { authenticatedUser } from "@/lib/supabase";
import { GraphHelper } from "@/components/graph-helper";

export default async function Workspace() {
  if (!configured()) redirect("/login");
  const auth = await authenticatedUser();
  if (!auth) redirect("/login");
  return (
    <main id="main" className="workspace">
      <div className="workspace-heading">
        <div>
          <p className="section-label">Physics Graph Helper</p>
          <h1>Your workspace</h1>
          <p className="signed-in">Signed in as {auth.user.email}</p>
        </div>
        <AuthForm mode="logout" draftUserId={auth.user.id} />
      </div>
      <GraphHelper key={auth.user.id} userId={auth.user.id} />
      <section className="account-settings" aria-labelledby="account-title">
        <h2 id="account-title">Account settings</h2>
        <details>
          <summary>Change password</summary>
          <div className="details-content">
            <p>
              Confirm your current password first. You’ll log in again after
              changing it.
            </p>
            <AuthForm mode="change-password" draftUserId={auth.user.id} />
          </div>
        </details>
        <details>
          <summary>Delete account</summary>
          <div className="details-content">
            <AuthForm mode="delete-account" draftUserId={auth.user.id} />
          </div>
        </details>
      </section>
    </main>
  );
}
