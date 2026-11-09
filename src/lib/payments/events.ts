import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { adminSupabase } from "@/lib/supabase";

export function eventHash(raw: Uint8Array | string, category = "") {
  return createHash("sha256").update(raw).update(category).digest("hex");
}

export function paymentLog(event: string, outcome: string) {
  // Never log API keys, email addresses, checkout links or provider payloads.
  console.info("payment_event", { requestId: randomUUID(), event, outcome });
}

function unownedPayload(input: {
  reference?: string;
  event: string;
  payload: unknown;
}) {
  const root =
    input.payload &&
    typeof input.payload === "object" &&
    !Array.isArray(input.payload)
      ? (input.payload as Record<string, unknown>)
      : {};
  const data =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const safe: Record<string, string | number> = { event: input.event };
  if (input.reference) safe.reference = input.reference;
  if (typeof data.status === "string" && /^[a-z_-]{1,40}$/.test(data.status))
    safe.status = data.status;
  if (typeof data.currency === "string" && /^[A-Z]{3}$/.test(data.currency))
    safe.currency = data.currency;
  if (
    typeof data.amount === "number" &&
    Number.isSafeInteger(data.amount) &&
    data.amount >= 0
  )
    safe.amount = data.amount;
  else if (typeof data.amount === "string" && /^\d{1,10}$/.test(data.amount))
    safe.amount = data.amount;
  return safe;
}

export async function recordEvent(input: {
  reference?: string;
  userId?: string;
  event: string;
  payload: unknown;
  hash: string;
  outcome: string;
}) {
  const { error } = await adminSupabase()
    .from("payment_events")
    .upsert(
      {
        paystack_reference: input.reference ?? null,
        user_id: input.userId ?? null,
        event_type: input.event,
        // Without an account FK there is no deletion cascade. Keep only minimal
        // audit fields, never customer identity, authorization or card metadata.
        raw_payload: input.userId ? input.payload : unownedPayload(input),
        event_hash: input.hash,
        outcome: input.outcome,
        processed_at: new Date().toISOString(),
      },
      { onConflict: "event_hash", ignoreDuplicates: true },
    );
  if (error) throw new Error("Payment event could not be recorded.");
}
