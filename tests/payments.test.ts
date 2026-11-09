import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeTransaction,
  matchesAttempt,
  paymentKeys,
  validWebhookSignature,
  verifyTransaction,
} from "@/lib/payments/paystack";

const testSecret = "sk_test_not_a_real_key";
const signingSecret = "whsec_not_a_real_signing_secret";
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", testSecret);
  vi.stubEnv("PAYSTACK_WEBHOOK_SECRET", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Paystack signature and test-mode boundary", () => {
  it("verifies legacy HMAC over the original bytes and rejects any body modification", () => {
    const raw = Buffer.from(
      '{"event":"charge.success", "data":{"amount":5000}}',
    );
    const signature = createHmac("sha512", testSecret)
      .update(raw)
      .digest("hex");
    const headers = new Headers({ "x-paystack-signature": signature });
    expect(validWebhookSignature(raw, headers, paymentKeys())).toBe(true);
    expect(
      validWebhookSignature(
        Buffer.from(raw.toString().replace("5000", "5001")),
        headers,
        paymentKeys(),
      ),
    ).toBe(false);
  });
  it.each(["", "a".repeat(127), "é".repeat(128), "A".repeat(128)])(
    "rejects malformed signature without throwing",
    (signature) => {
      expect(
        validWebhookSignature(
          Buffer.from("{}"),
          new Headers({ "x-paystack-signature": signature }),
          paymentKeys(),
        ),
      ).toBe(false);
    },
  );
  it("verifies the modern timestamped signature and any matching rotation entry", () => {
    const raw = Buffer.from('{"event":"charge.success"}');
    const now = 1794048000;
    const signature = createHmac("sha512", signingSecret)
      .update(`${now}.`)
      .update(raw)
      .digest("hex");
    expect(
      validWebhookSignature(
        raw,
        new Headers({
          "paystack-signature": `t=${now},v1=whk_old:${"0".repeat(128)},v1=whk_new:${signature}`,
        }),
        { secretKey: testSecret, webhookSecret: signingSecret },
        now,
      ),
    ).toBe(true);
    expect(
      validWebhookSignature(
        raw,
        new Headers({
          "paystack-signature": `t=${now},v1=whk_new:${signature}`,
        }),
        { secretKey: testSecret, webhookSecret: signingSecret },
        now + 301,
      ),
    ).toBe(false);
  });
  it("never falls back to the legacy header when modern verification is configured", () => {
    const raw = Buffer.from("{}");
    const signature = createHmac("sha512", testSecret)
      .update(raw)
      .digest("hex");
    expect(
      validWebhookSignature(
        raw,
        new Headers({ "x-paystack-signature": signature }),
        { secretKey: testSecret, webhookSecret: signingSecret },
      ),
    ).toBe(false);
  });
  it("rejects duplicate timestamps and future events outside the tolerance", () => {
    const raw = Buffer.from("{}");
    const now = 1794048000;
    const signature = createHmac("sha512", signingSecret)
      .update(`${now}.`)
      .update(raw)
      .digest("hex");
    for (const timestamp of [`t=${now},t=${now}`, `t=${now + 301}`])
      expect(
        validWebhookSignature(
          raw,
          new Headers({
            "paystack-signature": `${timestamp},v1=whk_test:${signature}`,
          }),
          { secretKey: testSecret, webhookSecret: signingSecret },
          now,
        ),
      ).toBe(false);
  });
  it("refuses live or missing secret keys", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_do_not_use");
    expect(() => paymentKeys()).toThrow("Test payments are not configured");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    expect(() => paymentKeys()).toThrow("Test payments are not configured");
  });
});

describe("Paystack server calls", () => {
  it("initializes only the server amount and validates the hosted checkout response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          status: true,
          data: {
            reference: "graphbook-test",
            authorization_url: "https://checkout.paystack.com/test",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      reference: "graphbook-test",
      email: "student@example.edu",
      amount: 5000,
      currency: "GHS",
      callbackUrl: "https://graph.example.edu/payments/return",
      userId: "user-a",
      plan: "semester",
    };
    expect(await initializeTransaction(input)).toBe(
      "https://checkout.paystack.com/test",
    );
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect(JSON.parse(options.body)).toMatchObject({
      amount: "5000",
      currency: "GHS",
      reference: "graphbook-test",
    });
    expect(options.redirect).toBe("error");
    fetchMock.mockResolvedValueOnce(
      Response.json({
        status: true,
        data: {
          reference: "graphbook-test",
          authorization_url: "https://evil.example/checkout",
        },
      }),
    );
    await expect(initializeTransaction(input)).rejects.toThrow(
      "checkout address",
    );
  });
  it("requires the provider envelope and complete verification data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: false, data: {} }))
      .mockResolvedValueOnce(
        Response.json({ status: true, data: { reference: "test" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyTransaction("test")).rejects.toThrow(
      "payment service response",
    );
    await expect(verifyTransaction("test")).rejects.toThrow("incomplete");
  });
  it("matches the exact reference, amount, currency and test domain", () => {
    const attempt = { reference: "test", amount: 5000, currency: "GHS" };
    const data = { ...attempt, status: "success", domain: "test" };
    expect(matchesAttempt(data, attempt)).toBe(true);
    for (const changed of [
      { amount: 1 },
      { currency: "NGN" },
      { reference: "other" },
      { domain: "live" },
    ])
      expect(matchesAttempt({ ...data, ...changed }, attempt)).toBe(false);
  });
});
