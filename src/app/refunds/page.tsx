import type { Metadata } from "next";
import Link from "next/link";
import "@/components/report-guide.css";

export const metadata: Metadata = { title: "Refund policy" };

export default function RefundsPage() {
  return (
    <main id="main" className="policy-page">
      <p className="section-label">Test service</p>
      <h1>Refund policy</h1>
      <p className="policy-notice">
        Draft policy for testing. A live refund policy must be confirmed before
        launch.
      </p>

      <h2>During testing</h2>
      <p>
        Test payments do not move real money. Use Paystack’s test checkout
        details only. The price and semester dates shown in the app are
        placeholders for testing.
      </p>

      <h2>If access is still being confirmed</h2>
      <p>
        A return from checkout does not immediately unlock a pass. Wait for the
        confirmation message and avoid paying again while the first transaction
        is still being checked.
      </p>

      <h2>Payment questions</h2>
      <p>
        Contact the app owner through the channel where you received access.
        Include the transaction reference and a short description of the
        problem. Do not send your password or card details.
      </p>

      <h2>Refunded access</h2>
      <p>
        If Paystack confirms a processed refund, access provided by that payment
        is removed. Other valid semester passes are checked separately. Account
        deletion does not itself request a refund.
      </p>

      <nav className="policy-links" aria-label="Related pages">
        <Link href="/terms">Terms of use</Link>
        <Link href="/upgrade">Back to semester pass</Link>
        <Link href="/workspace">Back to workspace</Link>
      </nav>
    </main>
  );
}
