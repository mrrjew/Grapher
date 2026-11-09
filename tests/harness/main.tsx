import { createRoot } from "react-dom/client";
import { GraphHelper } from "@/components/graph-helper";
import { AuthForm } from "@/components/auth-form";
import "@/app/globals.css";
import type { AuthMode } from "@/lib/validation";
import { PaymentConfirmation } from "@/components/payment-confirmation";
import { CheckoutButton } from "@/components/checkout-button";

const requestedMode = new URLSearchParams(window.location.search).get("auth");
const phase2 = new URLSearchParams(window.location.search);
const modes = [
  "login",
  "signup",
  "forgot-password",
  "resend",
  "reset-password",
  "change-password",
  "delete-account",
];
const authMode =
  requestedMode && modes.includes(requestedMode)
    ? (requestedMode as AuthMode)
    : null;

createRoot(document.getElementById("root")!).render(
  <main id="main" className="workspace">
    <div className="workspace-heading">
      <div>
        <p className="section-label">Physics Graph Helper</p>
        <h1>Your workspace</h1>
      </div>
      <AuthForm mode="logout" draftUserId="test-student" />
    </div>
    {phase2.has("payment") ? (
      <PaymentConfirmation reference="graphbook-test" />
    ) : phase2.has("checkout") ? (
      <CheckoutButton available />
    ) : authMode ? (
      <section aria-label="Account form">
        <AuthForm mode={authMode} />
      </section>
    ) : (
      <GraphHelper userId="test-student" savingEnabled={phase2.has("saved")} />
    )}
  </main>,
);
