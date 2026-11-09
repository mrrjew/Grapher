import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/config";
import { authenticatedUser } from "@/lib/supabase";
import { GraphHelper } from "@/components/graph-helper";
import Link from "next/link";
import { hasSemesterPass } from "@/lib/access";
import { ReportGuide } from "@/components/report-guide";

export default async function Workspace() {
  if (!configured()) redirect("/login");
  const auth = await authenticatedUser();
  if (!auth) redirect("/login");
  const paid = await hasSemesterPass(auth.client);
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
      <p className="access-note">
        {paid ? (
          "Your semester pass is active."
        ) : (
          <>
            Free account: one saved graph.{" "}
            <Link href="/upgrade">View the semester pass</Link>.
          </>
        )}
      </p>
      <GraphHelper key={auth.user.id} userId={auth.user.id} savingEnabled />
      {paid ? (
        <ReportGuide />
      ) : (
        <section
          className="report-locked"
          aria-labelledby="report-locked-title"
        >
          <h2 id="report-locked-title">Report guide</h2>
          <p>
            The semester pass includes guidance and short examples for every
            section of a physics lab report.
          </p>
          <Link href="/upgrade">View the semester pass</Link>
        </section>
      )}
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
