import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  adminSupabase: () => ({ from: mocks.from }),
}));
import { recordEvent } from "@/lib/payments/events";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue({ upsert: mocks.upsert });
  mocks.upsert.mockResolvedValue({ error: null });
});
describe("payment audit privacy", () => {
  const payload = {
    event: "charge.success",
    data: {
      status: "success",
      amount: 5000,
      currency: "GHS",
      customer: { email: "private@example.edu" },
      authorization: { authorization_code: "sensitive-card-token" },
      metadata: { user_id: "deleted-account" },
    },
  };
  it("keeps only nonidentity audit fields for unknown or deleted accounts", async () => {
    await recordEvent({
      reference: "graphbook-test",
      event: "charge.success",
      payload,
      hash: "a".repeat(64),
      outcome: "unknown_reference",
    });
    expect(mocks.upsert.mock.calls[0][0].raw_payload).toEqual({
      event: "charge.success",
      reference: "graphbook-test",
      status: "success",
      amount: 5000,
      currency: "GHS",
    });
    expect(JSON.stringify(mocks.upsert.mock.calls[0][0])).not.toContain(
      "private@example.edu",
    );
    expect(JSON.stringify(mocks.upsert.mock.calls[0][0])).not.toContain(
      "sensitive-card-token",
    );
  });
  it("retains the signed raw JSON only when its verified account FK can cascade on deletion", async () => {
    await recordEvent({
      reference: "graphbook-test",
      userId: "verified-account",
      event: "charge.success",
      payload,
      hash: "a".repeat(64),
      outcome: "processed",
    });
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      user_id: "verified-account",
      raw_payload: payload,
    });
  });
  it("does not persist arbitrary strings disguised as safe fields", async () => {
    await recordEvent({
      event: "webhook.unknown",
      payload: {
        status: { email: "private@example.edu" },
        amount: "private@example.edu",
        currency: "private@example.edu",
      },
      hash: "a".repeat(64),
      outcome: "missing_reference",
    });
    expect(mocks.upsert.mock.calls[0][0].raw_payload).toEqual({
      event: "webhook.unknown",
    });
  });
});
