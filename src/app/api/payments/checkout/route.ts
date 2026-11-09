import { randomUUID } from "node:crypto";
import { authenticatedUser, adminSupabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { semester } from "@/lib/semester";
import { jsonReply, requireSameOrigin, HttpError } from "@/lib/http";
import { rateLimit, RateLimitError } from "@/lib/rate-limit";
import { initializeTransaction, paymentKeys } from "@/lib/payments/paystack";
import { eventHash, paymentLog, recordEvent } from "@/lib/payments/events";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let reference: string | undefined;
  let userId: string | undefined;
  try {
    requireSameOrigin(request);
    const auth = await authenticatedUser();
    if (!auth)
      return jsonReply(
        { message: "Log in again before starting checkout." },
        401,
      );
    userId = auth.user.id;
    await rateLimit(request, "payment-checkout", auth.user.email!);
    paymentKeys();
    if (!semester.testMode || Date.parse(semester.expiresAt) <= Date.now())
      throw new HttpError(
        "This semester pass is not available right now.",
        409,
      );
    const access = await auth.client.rpc("has_semester_pass");
    if (access.error) throw new Error("Entitlement check failed.");
    if (access.data === true)
      return jsonReply(
        {
          message: "Your semester pass is already active.",
          redirect: "/workspace",
        },
        409,
      );
    reference = `graphbook-${randomUUID()}`;
    const db = adminSupabase();
    const attempt = await db.from("payment_attempts").insert({
      reference,
      user_id: auth.user.id,
      amount: semester.amountMinor,
      currency: semester.currency,
      expires_at: semester.expiresAt,
      plan: semester.plan,
    });
    if (attempt.error) throw new Error("Payment attempt could not be created.");
    const authorizationUrl = await initializeTransaction({
      reference,
      email: auth.user.email!,
      amount: semester.amountMinor,
      currency: semester.currency,
      callbackUrl: `${config().origin}/payments/return`,
      userId: auth.user.id,
      plan: semester.plan,
    });
    const initialized = await db
      .from("payment_attempts")
      .update({ status: "initialized" })
      .eq("reference", reference)
      .eq("status", "pending");
    if (initialized.error)
      throw new Error("Payment status could not be stored.");
    await recordEvent({
      reference,
      userId,
      event: "checkout.initialized",
      payload: {
        reference,
        amount: semester.amountMinor,
        currency: semester.currency,
        domain: "test",
      },
      hash: eventHash(reference, ":initialized"),
      outcome: "initialized",
    });
    paymentLog("checkout.initialized", "initialized");
    return jsonReply({ authorizationUrl, reference });
  } catch (error) {
    if (reference) {
      try {
        await adminSupabase()
          .from("payment_attempts")
          .update({ status: "failed" })
          .eq("reference", reference)
          .eq("status", "pending");
        await recordEvent({
          reference,
          userId,
          event: "checkout.failed",
          payload: { reference },
          hash: eventHash(reference, ":checkout.failed"),
          outcome: "failed",
        });
      } catch {
        paymentLog("checkout.failed", "logging_unavailable");
      }
    }
    paymentLog("checkout", "failed");
    if (error instanceof HttpError)
      return jsonReply({ message: error.message }, error.status);
    if (error instanceof RateLimitError)
      return jsonReply(
        {
          message:
            "Too many checkout attempts. Wait a little before trying again.",
        },
        429,
      );
    return jsonReply(
      { message: "Checkout could not be started. Please try again shortly." },
      503,
    );
  }
}
