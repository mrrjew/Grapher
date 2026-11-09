import { adminSupabase } from "@/lib/supabase";
import { jsonReply, readBytes, HttpError } from "@/lib/http";
import {
  paymentKeys,
  validWebhookSignature,
  validReference,
  verifyTransaction,
  matchesAttempt,
} from "@/lib/payments/paystack";
import { eventHash, paymentLog, recordEvent } from "@/lib/payments/events";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const raw = await readBytes(request, 524288);
    const keys = paymentKeys();
    if (!validWebhookSignature(raw, request.headers, keys)) {
      paymentLog("webhook", "signature_rejected");
      return jsonReply({ message: "Invalid webhook signature." }, 401);
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(raw).toString("utf8"));
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error();
    } catch {
      await recordEvent({
        event: "webhook.invalid_json",
        payload: { invalid_json: true },
        hash: eventHash(raw),
        outcome: "invalid_json",
      });
      return jsonReply({ message: "Invalid webhook payload." }, 400);
    }
    const event =
      typeof payload.event === "string" &&
      /^[a-z][a-z0-9_.-]{0,100}$/.test(payload.event)
        ? payload.event
        : "webhook.unknown";
    const data =
      payload.data &&
      typeof payload.data === "object" &&
      !Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>)
        : {};
    const nested =
      data.transaction && typeof data.transaction === "object"
        ? (data.transaction as Record<string, unknown>)
        : {};
    const reference =
      data.transaction_reference ?? nested.reference ?? data.reference;
    const hash = eventHash(raw);
    if (!validReference(reference)) {
      await recordEvent({ event, payload, hash, outcome: "missing_reference" });
      paymentLog(event, "missing_reference");
      return jsonReply({ received: true });
    }
    const db = adminSupabase();
    const found = await db
      .from("payment_attempts")
      .select("reference,user_id,amount,currency")
      .eq("reference", reference)
      .maybeSingle();
    if (found.error) throw new Error("Payment attempt lookup failed.");
    if (!found.data) {
      await recordEvent({
        reference,
        event,
        payload,
        hash,
        outcome: "unknown_reference",
      });
      paymentLog(event, "unknown_reference");
      return jsonReply({ received: true });
    }
    const attempt = found.data;
    let verified;
    try {
      verified = await verifyTransaction(reference);
    } catch (error) {
      // Preserve the raw event under a separate failure key. Its real event hash
      // stays available so Paystack's retry can still grant once verification works.
      await recordEvent({
        reference,
        userId: attempt.user_id,
        event: `${event}.verification_failed`,
        payload,
        hash: eventHash(raw, ":verification_failed"),
        outcome: "verification_unavailable",
      });
      paymentLog(event, "verification_unavailable");
      throw error;
    }
    if (
      event === "charge.success" &&
      matchesAttempt(verified, attempt) &&
      ["pending", "ongoing", "processing", "queued"].includes(verified.status)
    ) {
      await recordEvent({
        reference,
        userId: attempt.user_id,
        event: "charge.verification_pending",
        payload,
        hash: eventHash(raw, ":verification_pending"),
        outcome: "verification_pending",
      });
      paymentLog(event, "verification_pending");
      return jsonReply(
        { message: "Payment verification is still pending. Retry this event." },
        503,
      );
    }
    const applied = await db.rpc("apply_payment_event", {
      p_reference: reference,
      p_event_type: event,
      p_payload: payload,
      p_event_hash: hash,
      p_verified: verified,
    });
    if (applied.error) throw new Error("Payment event processing failed.");
    paymentLog(
      event,
      !matchesAttempt(verified, attempt)
        ? "verification_mismatch"
        : applied.data === false
          ? "duplicate"
          : "processed",
    );
    return jsonReply({ received: true });
  } catch (error) {
    paymentLog("webhook", "processing_failed");
    if (error instanceof HttpError)
      return jsonReply({ message: error.message }, error.status);
    return jsonReply(
      {
        message:
          "Payment processing is temporarily unavailable. Retry this event.",
      },
      503,
    );
  }
}
