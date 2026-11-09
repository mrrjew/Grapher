"use client";
import { useState } from "react";

export function CheckoutButton({ available }: { available: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function pay() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(
          data.message || "Checkout could not be opened. Please try again.",
        );
        return;
      }
      const destination = new URL(data.authorizationUrl);
      if (
        destination.protocol !== "https:" ||
        destination.hostname !== "checkout.paystack.com"
      )
        throw new Error("Unexpected checkout destination.");
      window.location.assign(destination.href);
    } catch {
      setMessage(
        "Checkout could not be opened. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="button"
        onClick={pay}
        disabled={pending || !available}
      >
        {pending ? "Opening checkout…" : "Pay with Paystack"}
      </button>
      {!available && (
        <p className="hint">Test checkout is not configured yet.</p>
      )}
      {message && (
        <p className="message error-message" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
