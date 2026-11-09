import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/http";

export type PaystackKeys = { secretKey: string; webhookSecret?: string };
export type VerifiedTransaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  domain: string;
  [key: string]: unknown;
};

export function paymentKeys(): PaystackKeys {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || undefined;
  if (!secretKey || !/^sk_test_[A-Za-z0-9_-]+$/.test(secretKey)) {
    throw new HttpError(
      "Test payments are not configured. Please try again later.",
      503,
    );
  }
  if (webhookSecret && !/^whsec_[A-Za-z0-9_-]+$/.test(webhookSecret)) {
    throw new HttpError(
      "Payment verification is not configured. Please try again later.",
      503,
    );
  }
  return { secretKey, webhookSecret };
}

function equalHex(expected: Buffer, value: string): boolean {
  return (
    /^[a-f0-9]{128}$/.test(value) &&
    timingSafeEqual(expected, Buffer.from(value, "hex"))
  );
}

/** Authenticate the exact bytes received. Never parse/serialize before this check. */
export function validWebhookSignature(
  raw: Uint8Array,
  headers: Headers,
  keys: PaystackKeys,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (keys.webhookSecret) {
    const header = headers.get("paystack-signature");
    if (!header || header.length > 8192) return false;
    let timestamp: number | null = null;
    const signatures: string[] = [];
    for (const part of header.split(",")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key === "t") {
        if (timestamp !== null || !/^\d+$/.test(value)) return false;
        timestamp = Number(value);
      } else if (key === "v1") {
        const colon = value.indexOf(":");
        if (colon > 0 && /^whk_[A-Za-z0-9_-]+$/.test(value.slice(0, colon)))
          signatures.push(value.slice(colon + 1));
      }
    }
    if (
      timestamp === null ||
      !Number.isSafeInteger(timestamp) ||
      Math.abs(now - timestamp) > 300
    )
      return false;
    const expected = createHmac("sha512", keys.webhookSecret)
      .update(`${timestamp}.`)
      .update(raw)
      .digest();
    return signatures.some((value) => equalHex(expected, value));
  }
  // Older test integrations use this header until a webhook signing secret is enabled.
  const signature = headers.get("x-paystack-signature");
  if (!signature) return false;
  return equalHex(
    createHmac("sha512", keys.secretKey).update(raw).digest(),
    signature,
  );
}

async function requestPaystack(
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const { secretKey } = paymentKeys();
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json();
  if (
    !response.ok ||
    payload?.status !== true ||
    !payload.data ||
    typeof payload.data !== "object" ||
    Array.isArray(payload.data)
  ) {
    throw new HttpError(
      "We could not confirm the payment service response. Please try again shortly.",
      503,
    );
  }
  return payload.data;
}

export async function initializeTransaction(input: {
  reference: string;
  email: string;
  amount: number;
  currency: string;
  callbackUrl: string;
  userId: string;
  plan: string;
}): Promise<string> {
  const data = await requestPaystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      reference: input.reference,
      email: input.email,
      amount: String(input.amount),
      currency: input.currency,
      callback_url: input.callbackUrl,
      metadata: JSON.stringify({ user_id: input.userId, plan: input.plan }),
    }),
  });
  if (
    data.reference !== input.reference ||
    typeof data.authorization_url !== "string"
  )
    throw new HttpError(
      "The checkout response did not match your payment. Please try again.",
      503,
    );
  const url = new URL(data.authorization_url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.paystack.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new HttpError(
      "The checkout address could not be verified. Please try again.",
      503,
    );
  return url.href;
}

export function validReference(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9.=-]{1,128}$/.test(value);
}

export async function verifyTransaction(
  reference: string,
): Promise<VerifiedTransaction> {
  if (!validReference(reference))
    throw new HttpError("This payment reference is invalid.", 400);
  const data = await requestPaystack(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  if (
    typeof data.reference !== "string" ||
    typeof data.status !== "string" ||
    !Number.isSafeInteger(data.amount) ||
    typeof data.currency !== "string" ||
    typeof data.domain !== "string"
  )
    throw new HttpError(
      "The payment verification response was incomplete. Please try again.",
      503,
    );
  return data as VerifiedTransaction;
}

export function matchesAttempt(
  transaction: VerifiedTransaction,
  attempt: { reference: string; amount: number; currency: string },
): boolean {
  return (
    transaction.reference === attempt.reference &&
    transaction.amount === attempt.amount &&
    transaction.currency === attempt.currency &&
    transaction.domain === "test"
  );
}
