import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedUser: vi.fn(),
  adminFrom: vi.fn(),
  userFrom: vi.fn(),
  rpc: vi.fn(),
  userRpc: vi.fn(),
  rateLimit: vi.fn(),
  fetch: vi.fn(),
  recordEvent: vi.fn(),
}));
vi.mock("@/lib/config", () => ({
  config: () => ({ origin: "https://graph.example.edu" }),
}));
vi.mock("@/lib/supabase", () => ({
  authenticatedUser: mocks.authenticatedUser,
  adminSupabase: () => ({ from: mocks.adminFrom, rpc: mocks.rpc }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  RateLimitError: class RateLimitError extends Error {},
}));
vi.mock("@/lib/payments/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/events")>()),
  recordEvent: mocks.recordEvent,
}));
import { POST as webhook } from "@/app/api/payments/webhook/route";
import { POST as checkout } from "@/app/api/payments/checkout/route";
import { GET as status } from "@/app/api/payments/status/route";

function query(data: unknown = null, error: unknown = null) {
  const result = { data, error };
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    lte: vi.fn(),
    gt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  for (const method of [
    "select",
    "eq",
    "is",
    "lte",
    "gt",
    "order",
    "limit",
    "insert",
    "update",
    "in",
  ] as const)
    builder[method].mockReturnValue(builder);
  return builder;
}
const key = "sk_test_not_real";
const attempt = {
  reference: "graphbook-test",
  user_id: "user-a",
  amount: 5000,
  currency: "GHS",
  status: "initialized",
};
const verified = {
  reference: "graphbook-test",
  amount: 5000,
  currency: "GHS",
  status: "success",
  domain: "test",
};
function signedRequest(payload: unknown) {
  const raw = JSON.stringify(payload);
  return new Request("https://graph.example.edu/api/payments/webhook", {
    method: "POST",
    body: raw,
    headers: {
      "x-paystack-signature": createHmac("sha512", key)
        .update(raw)
        .digest("hex"),
    },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-07T12:00:00Z'));
  vi.stubEnv("PAYSTACK_SECRET_KEY", key);
  vi.stubEnv("PAYSTACK_WEBHOOK_SECRET", "");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.authenticatedUser.mockResolvedValue({
    user: { id: "user-a", email: "student@example.edu" },
    client: { from: mocks.userFrom, rpc: mocks.userRpc },
  });
  mocks.adminFrom.mockReturnValue(query(attempt));
  mocks.userFrom.mockImplementation((table) =>
    query(table === "entitlements" ? null : attempt),
  );
  mocks.userRpc.mockResolvedValue({ data: false, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.recordEvent.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue(
    Response.json({ status: true, data: verified }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('does not start a new checkout after the configured semester expires', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-01-01T00:00:00Z'));
  const result = await checkout(new Request('https://graph.example.edu/api/payments/checkout', { method: 'POST', headers: { origin: 'https://graph.example.edu' } }));
  expect(result.status).toBe(409);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.adminFrom).not.toHaveBeenCalled();
});

it("leaves a temporarily pending verification retryable without consuming its real event hash", async () => {
  mocks.fetch
    .mockResolvedValueOnce(
      Response.json({ status: true, data: { ...verified, status: "pending" } }),
    )
    .mockResolvedValueOnce(Response.json({ status: true, data: verified }));
  const payload = {
    event: "charge.success",
    data: { reference: attempt.reference },
  };
  expect((await webhook(signedRequest(payload))).status).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.recordEvent).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: "verification_pending" }),
  );
  expect((await webhook(signedRequest(payload))).status).toBe(200);
  expect(mocks.recordEvent.mock.calls[0][0].hash).not.toBe(
    mocks.rpc.mock.calls[0][1].p_event_hash,
  );
});

describe("payment webhook integration boundaries", () => {
  it("rejects an invalid signature before parsing, database calls or provider verification", async () => {
    const response = await webhook(
      new Request("https://graph.example.edu/api/payments/webhook", {
        method: "POST",
        body: "not json",
        headers: { "x-paystack-signature": "0".repeat(128) },
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("verifies with Paystack before handing a successful charge to the atomic idempotent RPC", async () => {
    const payload = {
      event: "charge.success",
      data: { reference: attempt.reference },
    };
    expect((await webhook(signedRequest(payload))).status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.paystack.co/transaction/verify/graphbook-test",
      expect.anything(),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_payment_event",
      expect.objectContaining({
        p_reference: attempt.reference,
        p_event_type: "charge.success",
        p_verified: verified,
      }),
    );
    expect(mocks.fetch.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0],
    );
  });
  it("uses the identical event hash and reference on duplicate delivery", async () => {
    const payload = {
      event: "charge.success",
      data: { reference: attempt.reference },
    };
    mocks.fetch.mockImplementation(async () =>
      Response.json({ status: true, data: verified }),
    );
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    await webhook(signedRequest(payload));
    await webhook(signedRequest(payload));
    expect(mocks.rpc.mock.calls[0][1]).toEqual(mocks.rpc.mock.calls[1][1]);
  });
  it("passes amount/currency/domain mismatches only to the guarded RPC for logging, never a direct entitlement write", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        status: true,
        data: {
          ...verified,
          reference: "other-transaction",
          amount: 1,
          currency: "NGN",
          domain: "live",
        },
      }),
    );
    expect(
      (
        await webhook(
          signedRequest({
            event: "charge.success",
            data: { reference: attempt.reference },
          }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_payment_event",
      expect.objectContaining({
        p_verified: expect.objectContaining({
          reference: "other-transaction",
          amount: 1,
          currency: "NGN",
          domain: "live",
        }),
      }),
    );
    expect(mocks.adminFrom).not.toHaveBeenCalledWith("entitlements");
  });
  it("keeps the real event hash unprocessed after a provider outage so a retry can succeed", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(Response.json({ status: true, data: verified }));
    const payload = {
      event: "charge.success",
      data: { reference: attempt.reference },
    };
    expect((await webhook(signedRequest(payload))).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "verification_unavailable" }),
    );
    expect((await webhook(signedRequest(payload))).status).toBe(200);
    expect(mocks.recordEvent.mock.calls[0][0].hash).not.toBe(
      mocks.rpc.mock.calls[0][1].p_event_hash,
    );
  });
  it("looks up the refund transaction reference and verifies its reversed state before processing", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        status: true,
        data: { ...verified, status: "reversed" },
      }),
    );
    expect(
      (
        await webhook(
          signedRequest({
            event: "refund.processed",
            data: {
              transaction_reference: attempt.reference,
              status: "processed",
              amount: 5000,
              currency: "GHS",
            },
          }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_payment_event",
      expect.objectContaining({
        p_event_type: "refund.processed",
        p_verified: expect.objectContaining({ status: "reversed" }),
      }),
    );
  });
});

describe("checkout and status boundaries", () => {
  it("creates hosted checkout from the server snapshot and ignores browser amount/user claims", async () => {
    mocks.fetch.mockImplementation(async (_url, options) => {
      const input = JSON.parse(options.body);
      return Response.json({
        status: true,
        data: {
          reference: input.reference,
          authorization_url: "https://checkout.paystack.com/test-checkout",
        },
      });
    });
    const response = await checkout(
      new Request("https://graph.example.edu/api/payments/checkout", {
        method: "POST",
        headers: {
          Origin: "https://graph.example.edu",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: 1, currency: "NGN", user_id: "victim" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      authorizationUrl: "https://checkout.paystack.com/test-checkout",
      reference: expect.stringMatching(/^graphbook-[a-f0-9-]+$/),
    });
    const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(sent).toMatchObject({
      amount: "5000",
      currency: "GHS",
      email: "student@example.edu",
    });
    expect(JSON.parse(sent.metadata)).toMatchObject({ user_id: "user-a" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not start a second checkout for an active pass", async () => {
    mocks.userRpc.mockResolvedValue({ data: true, error: null });
    expect(
      (
        await checkout(
          new Request("https://graph.example.edu/api/payments/checkout", {
            method: "POST",
            headers: { Origin: "https://graph.example.edu" },
          }),
        )
      ).status,
    ).toBe(409);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("requires a logged-in user before checkout or status lookup", async () => {
    mocks.authenticatedUser.mockResolvedValue(null);
    expect(
      (
        await checkout(
          new Request("https://graph.example.edu/api/payments/checkout", {
            method: "POST",
            headers: { Origin: "https://graph.example.edu" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await status(
          new Request("https://graph.example.edu/api/payments/status"),
        )
      ).status,
    ).toBe(401);
  });
  it("rejects cross-origin checkout without creating a transaction", async () => {
    expect(
      (
        await checkout(
          new Request("https://graph.example.edu/api/payments/checkout", {
            method: "POST",
            headers: { Origin: "https://evil.example" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("never unlocks on a return/status request even when the provider says success", async () => {
    const response = await status(
      new Request(
        `https://graph.example.edu/api/payments/status?reference=${attempt.reference}`,
      ),
    );
    expect(await response.json()).toMatchObject({
      paid: false,
      paymentStatus: "pending",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminFrom).not.toHaveBeenCalledWith("entitlements");
  });
  it("reports failed or abandoned transactions without granting any entitlement", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        status: true,
        data: { ...verified, status: "abandoned" },
      }),
    );
    const response = await status(
      new Request(
        `https://graph.example.edu/api/payments/status?reference=${attempt.reference}`,
      ),
    );
    expect(await response.json()).toMatchObject({
      paid: false,
      paymentStatus: "abandoned",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("cannot inspect or verify another user’s transaction reference", async () => {
    mocks.userFrom.mockReturnValue(query(null));
    expect(
      (
        await status(
          new Request(
            "https://graph.example.edu/api/payments/status?reference=other-user",
          ),
        )
      ).status,
    ).toBe(404);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
