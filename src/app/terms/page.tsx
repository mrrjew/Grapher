import type { Metadata } from "next";
import Link from "next/link";
import "@/components/report-guide.css";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <main id="main" className="policy-page">
      <p className="section-label">Test service</p>
      <h1>Terms of use</h1>
      <p className="policy-notice">
        Draft terms for testing. Final terms must be confirmed before the
        service accepts live payments.
      </p>

      <h2>A learning aid</h2>
      <p>
        Physics Graph Helper helps you work through graph scales and plan your
        own lab report. Check your entries and follow your department’s
        assessment instructions. You are responsible for the work you submit.
      </p>

      <h2>Your account and work</h2>
      <p>
        Use an email address you control and keep your password private. Save
        only data you are permitted to store. Log out after using a shared
        device. Browser drafts stay on that device until removed; they are not a
        substitute for an online saved graph.
      </p>

      <h2>Semester access</h2>
      <p>
        The upgrade screen states the current semester price, currency and
        expiry. A semester pass is a one-off purchase with no recurring
        subscription. Access is granted only after payment has been verified.
        Test payments do not move real money.
      </p>

      <h2>Account deletion</h2>
      <p>
        You can delete your account from the workspace. This removes your
        account, saved graphs, pass records and payment logs linked to your
        account in this app. Paystack handles payments separately and may retain
        its transaction records under its own policies. Deleting an account does
        not submit a refund request.
      </p>

      <h2>Questions</h2>
      <p>
        Contact the app owner through the channel where you received access.
        Report a payment or access problem with its transaction reference; do
        not send passwords or card details.
      </p>

      <nav className="policy-links" aria-label="Related pages">
        <Link href="/refunds">Refund policy</Link>
        <Link href="/upgrade">Back to semester pass</Link>
        <Link href="/workspace">Back to workspace</Link>
      </nav>
    </main>
  );
}
