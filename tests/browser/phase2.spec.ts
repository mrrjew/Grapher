import { test, expect } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:3001" });
const id = "10000000-0000-4000-8000-000000000001";
const draft = {
  title: "Saved spring graph",
  xLabel: "Force",
  xUnit: "N",
  yLabel: "Extension",
  yUnit: "mm",
  xBoxes: "10",
  yBoxes: "10",
  rows: [
    { id: "row-1", x: "1", y: "2" },
    { id: "row-2", x: "2", y: "4" },
  ],
};

async function fillGraph(page: import("@playwright/test").Page) {
  await page
    .getByLabel("Graph title", { exact: true })
    .fill("Current measurements");
  await page.getByLabel("X variable", { exact: true }).fill("Force");
  await page.getByLabel("Y variable", { exact: true }).fill("Extension");
  await page.getByLabel("Row 1, x value", { exact: true }).fill("1");
  await page.getByLabel("Row 1, y value", { exact: true }).fill("2");
}

test("saving preserves edits and retries the same identifier after failure", async ({
  page,
}) => {
  const ids: string[] = [];
  await page.route("**/api/graphs?offset=0", (route) =>
    route.fulfill({ json: { graphs: [], paid: false, nextOffset: null } }),
  );
  await page.route("**/api/graphs", (route) => {
    const body = route.request().postDataJSON();
    ids.push(body.id);
    return route.fulfill({
      status: ids.length === 1 ? 503 : 200,
      json:
        ids.length === 1
          ? { message: "The save request timed out. Your table is still here." }
          : { id: body.id },
    });
  });
  await page.goto("/?saved=1");
  await fillGraph(page);
  await page.getByRole("button", { name: "Save graph", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("timed out");
  await expect(page.getByLabel("Graph title", { exact: true })).toHaveValue(
    "Current measurements",
  );
  await page.getByRole("button", { name: "Save graph", exact: true }).click();
  await expect(page.getByText("Graph saved.", { exact: true })).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await page.reload();
  await page.getByRole("button", { name: "Save graph", exact: true }).click();
  await expect.poll(() => ids.length).toBe(3);
  expect(ids[2]).toBe(ids[0]);
});

test("loading a saved graph restores labels, rows and chosen boxes", async ({
  page,
}, testInfo) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/graphs?offset=0", (route) =>
    route.fulfill({
      json: {
        graphs: [
          { id, title: draft.title, created_at: "2026-11-07T00:00:00Z" },
        ],
        paid: false,
        nextOffset: null,
      },
    }),
  );
  await page.route(`**/api/graphs/${id}`, (route) =>
    route.fulfill({ json: { id, draft } }),
  );
  await page.goto("/?saved=1");
  await page
    .getByRole("button", { name: `Load ${draft.title}`, exact: true })
    .click();
  await expect(page.getByLabel("Graph title", { exact: true })).toHaveValue(
    draft.title,
  );
  await expect(page.getByLabel("X unit", { exact: true })).toHaveValue("N");
  await expect(page.getByLabel("Row 2, y value", { exact: true })).toHaveValue(
    "4",
  );
  await expect(page.getByLabel("X grid boxes", { exact: true })).toHaveValue(
    "10",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".saved-graphs")
    .screenshot({ path: testInfo.outputPath("saved-graphs.png") });
});

test("loading does not silently overwrite measurements typed during the request", async ({
  page,
}) => {
  let confirmations = 0;
  page.on("dialog", (dialog) =>
    ++confirmations === 1 ? dialog.accept() : dialog.dismiss(),
  );
  let release: (() => Promise<void>) | undefined;
  await page.route("**/api/graphs?offset=0", (route) =>
    route.fulfill({
      json: {
        graphs: [
          { id, title: draft.title, created_at: "2026-11-07T00:00:00Z" },
        ],
        paid: false,
        nextOffset: null,
      },
    }),
  );
  await page.route(
    `**/api/graphs/${id}`,
    (route) =>
      new Promise<void>((resolve) => {
        release = async () => {
          await route.fulfill({ json: { id, draft } });
          resolve();
        };
      }),
  );
  await page.goto("/?saved=1");
  await fillGraph(page);
  await page
    .getByRole("button", { name: `Load ${draft.title}`, exact: true })
    .click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page
    .getByLabel("Graph title", { exact: true })
    .fill("New measurements while loading");
  await release!();
  await expect(
    page.getByText("Your newer table edits were kept.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Graph title", { exact: true })).toHaveValue(
    "New measurements while loading",
  );
});

test("a slow webhook leaves the student in confirmation without browser unlock", async ({
  page,
}) => {
  await page.clock.install();
  let checks = 0;
  await page.route(
    "**/api/payments/status?reference=graphbook-test",
    (route) => {
      checks++;
      return route.fulfill({
        json: { paid: false, expiresAt: null, paymentStatus: "pending" },
      });
    },
  );
  await page.goto("/?payment=1");
  await expect(
    page.getByRole("status").filter({ hasText: /Confirming your payment/ }),
  ).toBeVisible();
  for (let attempt = 0; attempt < 10; attempt++) {
    await expect.poll(() => checks).toBeGreaterThanOrEqual(attempt + 1);
    await page.clock.runFor(2100);
  }
  await expect(
    page.getByRole("status").filter({ hasText: /Still confirming/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/payment=1/);
});

test("payment failures and refunds never show an unlocked workspace", async ({
  page,
}) => {
  let paymentStatus = "failed";
  await page.route("**/api/payments/status?reference=graphbook-test", (route) =>
    route.fulfill({ json: { paid: false, expiresAt: null, paymentStatus } }),
  );
  await page.goto("/?payment=1");
  await expect(
    page.getByRole("status").filter({ hasText: /did not complete/ }),
  ).toBeVisible();
  paymentStatus = "refunded";
  await page.reload();
  await expect(
    page.getByRole("status").filter({ hasText: /refunded/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/payment=1/);
});

test("only an entitlement-status response can leave the confirmation screen", async ({
  page,
}) => {
  let paid = false;
  await page.route("**/api/payments/status?reference=graphbook-test", (route) =>
    route.fulfill({
      json: {
        paid,
        expiresAt: paid ? "2026-12-31T23:59:59Z" : null,
        paymentStatus: paid ? "success" : "pending",
      },
    }),
  );
  await page.route("http://127.0.0.1:3001/workspace", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<main><h1>Verified workspace</h1></main>",
    }),
  );
  await page.goto("/?payment=1");
  await expect(
    page.getByRole("status").filter({ hasText: /Confirming/ }),
  ).toBeVisible();
  paid = true;
  await expect(page).toHaveURL("http://127.0.0.1:3001/workspace");
});

test("checkout refuses an unexpected redirect destination", async ({
  page,
}) => {
  await page.route("**/api/payments/checkout", (route) =>
    route.fulfill({
      json: { authorizationUrl: "https://evil.example/checkout" },
    }),
  );
  await page.goto("/?checkout=1");
  await page.getByRole("button", { name: "Pay with Paystack" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Checkout could not be opened",
  );
  await expect(page).toHaveURL(/checkout=1/);
});
