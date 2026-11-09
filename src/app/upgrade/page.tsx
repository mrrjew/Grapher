import { redirect } from "next/navigation";
import Link from "next/link";
import { configured } from "@/lib/config";
import { authenticatedUser } from "@/lib/supabase";
import { hasSemesterPass } from "@/lib/access";
import { semester } from "@/lib/semester";
import { CheckoutButton } from "@/components/checkout-button";

export default async function Upgrade() {
  if (!configured()) redirect("/login");
  const auth = await authenticatedUser();
  if (!auth) redirect("/login");
  const paid = await hasSemesterPass(auth.client);
  return (
    <main id="main" className="narrow-page">
      <p className="section-label">Semester pass</p>
      <h1>{paid ? "Your pass is active" : "Keep your lab work together"}</h1>
      {paid ? (
        <p>You already have an active semester pass.</p>
      ) : (
        <>
          <p className="semester-price">{semester.priceLabel}</p>
          <p>
            One payment. Access until{" "}
            <time dateTime={semester.expiresAt}>
              {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "long",
                timeStyle: "long",
                timeZone: "UTC",
              }).format(new Date(semester.expiresAt))}
            </time>
            . No recurring subscription.
          </p>
          <ul>
            <li>Unlimited saved graphs, with saving and reloading.</li>
            <li>The full report guide, with examples for each section.</li>
          </ul>
          <p className="hint">
            Test checkout only. The price and semester date are placeholders.
            Test payments do not charge real money.
          </p>
          <p>
            Paystack handles checkout. Card details are entered on Paystack’s
            website.
          </p>
          <CheckoutButton
            available={
              Boolean(
                process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_"),
              ) && new Date(semester.expiresAt).getTime() > Date.now()
            }
          />
          <p className="hint policy-links">
            Before paying, read the <Link href="/terms">draft terms</Link> and{" "}
            <Link href="/refunds">draft refund policy</Link>.
          </p>
        </>
      )}
      <nav className="auth-links" aria-label="Workspace">
        <Link href="/workspace">Back to graph helper</Link>
      </nav>
    </main>
  );
}
