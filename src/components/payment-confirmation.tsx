"use client";
import { useEffect, useState } from "react";

export function PaymentConfirmation({
  reference,
}: {
  reference: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    "confirming" | "pending" | "failed" | "refunded" | "unavailable"
  >("confirming");
  useEffect(() => {
    let cancelled = false;
    setState("confirming");
    const deadline = Date.now() + 25000;
    async function poll() {
      for (
        let count = 0;
        count < 10 && !cancelled && Date.now() < deadline;
        count++
      ) {
        try {
          const response = await fetch(
            `/api/payments/status${reference ? `?reference=${encodeURIComponent(reference)}` : ""}`,
            {
              cache: "no-store",
              signal: AbortSignal.timeout(
                Math.min(10000, Math.max(1, deadline - Date.now())),
              ),
            },
          );
          const data = await response.json();
          if (cancelled) return;
          if (!response.ok) {
            setState("unavailable");
            return;
          }
          if (data.paid === true) {
            window.location.assign("/workspace");
            return;
          }
          if (
            data.paymentStatus === "failed" ||
            data.paymentStatus === "abandoned"
          ) {
            setState("failed");
            return;
          }
          if (data.paymentStatus === "refunded") {
            setState("refunded");
            return;
          }
          if (data.paymentStatus === "unavailable") {
            setState("unavailable");
            return;
          }
        } catch {
          if (!cancelled) setState("unavailable");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!cancelled) setState("pending");
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [reference, attempt]);
  const copy = {
    confirming:
      "Confirming your payment. Access will open after the verified payment notification arrives.",
    pending:
      "Still confirming. We will unlock your semester pass as soon as payment clears. You can return to the graph helper while you wait.",
    failed:
      "The payment did not complete. Your access has not changed. You can try checkout again.",
    refunded:
      "This payment has been refunded. The semester pass for this payment is no longer active.",
    unavailable:
      "We could not check your payment right now. Your access will open only after the payment is confirmed. Please check again shortly.",
  };
  return (
    <div>
      <p className="message" role="status">
        {copy[state]}
      </p>
      {state !== "confirming" && (
        <button
          className="button secondary"
          type="button"
          onClick={() => setAttempt(attempt + 1)}
        >
          Check payment again
        </button>
      )}
      <nav className="auth-links" aria-label="Payment options">
        <a href="/workspace">Back to graph helper</a>
        {state === "failed" && <a href="/upgrade">Try checkout again</a>}
      </nav>
    </div>
  );
}
