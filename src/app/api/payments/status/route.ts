import { authenticatedUser, adminSupabase } from "@/lib/supabase";
import { jsonReply, HttpError } from "@/lib/http";
import { rateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  matchesAttempt,
  validReference,
  verifyTransaction,
} from "@/lib/payments/paystack";
import { eventHash, paymentLog, recordEvent } from "@/lib/payments/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticatedUser();
    if (!auth)
      return jsonReply({ message: "Log in again to check your payment." }, 401);
    await rateLimit(request, "payment-status", auth.user.email!);
    const reference = new URL(request.url).searchParams.get("reference");
    if (reference !== null && !validReference(reference))
      throw new HttpError("This payment reference is invalid.", 400);
    const now = new Date().toISOString();
    const access = await auth.client
      .from("entitlements")
      .select("expires_at")
      .eq("user_id", auth.user.id)
      .is("revoked_at", null)
      .lte("starts_at", now)
      .gt("expires_at", now)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (access.error) throw new Error("Entitlement check failed.");
    const paid = Boolean(access.data);
    let paymentStatus = paid ? "success" : "pending";
    if (reference) {
      const found = await auth.client
        .from("payment_attempts")
        .select("reference,user_id,amount,currency,status")
        .eq("reference", reference)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (found.error) throw new Error("Payment lookup failed.");
      if (!found.data)
        throw new HttpError(
          "This payment could not be found for your account.",
          404,
        );
      const attempt = found.data;
      paymentStatus = ["success", "failed", "abandoned", "refunded"].includes(
        attempt.status,
      )
        ? attempt.status
        : "pending";
      if (!paid && paymentStatus === "pending") {
        try {
          const verified = await verifyTransaction(reference);
          if (!matchesAttempt(verified, attempt)) {
            paymentStatus = "unavailable";
            paymentLog("status", "verification_mismatch");
          } else if (["failed", "abandoned"].includes(verified.status)) {
            // Polling can record a failure, but can never create an entitlement.
            const db = adminSupabase();
            const updated = await db
              .from("payment_attempts")
              .update({ status: verified.status })
              .eq("reference", reference)
              .in("status", ["pending", "initialized"]);
            if (updated.error) throw new Error("Payment status update failed.");
            await recordEvent({
              reference,
              userId: auth.user.id,
              event: `status.${verified.status}`,
              payload: verified,
              hash: eventHash(reference, `:status.${verified.status}`),
              outcome: verified.status,
            });
            paymentStatus = verified.status;
          }
        } catch {
          paymentStatus = "unavailable";
          paymentLog("status", "verification_unavailable");
        }
      }
    }
    return jsonReply({
      paid,
      expiresAt: access.data?.expires_at ?? null,
      paymentStatus,
    });
  } catch (error) {
    if (error instanceof HttpError)
      return jsonReply({ message: error.message }, error.status);
    if (error instanceof RateLimitError)
      return jsonReply(
        { message: "Wait a little before checking your payment again." },
        429,
      );
    paymentLog("status", "unavailable");
    return jsonReply(
      {
        message:
          "Payment status is temporarily unavailable. Your access has not changed.",
      },
      503,
    );
  }
}
