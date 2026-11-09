import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authenticatedUser: vi.fn(),
  hasSemesterPass: vi.fn(),
  rateLimit: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  authenticatedUser: mocks.authenticatedUser,
}));
vi.mock("@/lib/access", () => ({ hasSemesterPass: mocks.hasSemesterPass }));
vi.mock("@/lib/config", () => ({
  config: () => ({ origin: "https://graph.example.edu" }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  RateLimitError: class RateLimitError extends Error {},
}));
import { POST, GET } from "@/app/api/graphs/route";
import { GET as load, DELETE as remove } from "@/app/api/graphs/[id]/route";
import { emptyDraft } from "@/lib/graph-input";
const id = "10000000-0000-4000-8000-000000000001";
const draft = {
  ...emptyDraft(),
  title: "Spring",
  xLabel: "Force",
  yLabel: "Extension",
  rows: [{ id: "row-1", x: "1,5", y: "2" }],
};
const request = (body: unknown, origin = "https://graph.example.edu") =>
  new Request("https://graph.example.edu/api/graphs", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticatedUser.mockResolvedValue({
    user: { id: "verified-owner" },
    client: { rpc: mocks.rpc, from: mocks.from },
  });
  mocks.hasSemesterPass.mockResolvedValue(false);
  mocks.rpc.mockResolvedValue({ data: id, error: null });
  mocks.rateLimit.mockResolvedValue(undefined);
});
describe("saved graph server boundaries", () => {
  it("denies unauthenticated list, load, save and delete", async () => {
    mocks.authenticatedUser.mockResolvedValue(null);
    expect(
      (await GET(new Request("https://graph.example.edu/api/graphs"))).status,
    ).toBe(401);
    expect((await POST(request({ id, draft }))).status).toBe(401);
    const context = { params: Promise.resolve({ id }) };
    expect(
      (
        await load(
          new Request(`https://graph.example.edu/api/graphs/${id}`),
          context,
        )
      ).status,
    ).toBe(401);
    expect((await remove(request({}), context)).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects foreign-origin writes before touching account data", async () => {
    expect(
      (await POST(request({ id, draft }, "https://evil.test"))).status,
    ).toBe(403);
    expect(mocks.authenticatedUser).not.toHaveBeenCalled();
  });
  it("derives ownership in the authenticated RPC and ignores browser paid/owner claims", async () => {
    const response = await POST(
      request({ id, draft, user_id: "victim", paid: true }),
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_graph",
      expect.objectContaining({ p_id: id, p_rows: draft.rows }),
    );
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("paid");
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "graph-save",
      "verified-owner",
    );
  });
  it("blocks invalid numbers before database writes", async () => {
    expect(
      (
        await POST(
          request({
            id,
            draft: { ...draft, rows: [{ id: "row-1", x: "NaN", y: "2" }] },
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails closed when persistent request limiting is unavailable", async () => {
    mocks.rateLimit.mockRejectedValue(new Error("offline"));
    expect((await POST(request({ id, draft }))).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["P0001", 403],
    ["42501", 403],
    ["54000", 429],
  ])("enforces database rejection %s", async (code, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code } });
    expect((await POST(request({ id, draft }))).status).toBe(status);
  });
  it("passes the same identifier on retries instead of creating a new graph", async () => {
    await POST(request({ id, draft }));
    await POST(request({ id, draft }));
    expect(mocks.rpc.mock.calls[0][1].p_id).toBe(
      mocks.rpc.mock.calls[1][1].p_id,
    );
  });
});
