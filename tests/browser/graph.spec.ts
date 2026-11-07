import { expect, test, type Page } from "@playwright/test";

// Exercise the real client component without adding a production auth bypass.
test.use({ baseURL: "http://127.0.0.1:3001" });

async function fillGraphDetails(page: Page) {
  await page
    .getByLabel("Graph title", { exact: true })
    .fill("Extension against force");
  await page.getByLabel("X variable", { exact: true }).fill("Force");
  await page.getByLabel("X unit", { exact: true }).fill("N");
  await page.getByLabel("Y variable", { exact: true }).fill("Extension");
  await page.getByLabel("Y unit", { exact: true }).fill("mm");
}

async function fillRow(page: Page, row: number, x: string, y: string) {
  await page.getByLabel(`Row ${row}, x value`, { exact: true }).fill(x);
  await page.getByLabel(`Row ${row}, y value`, { exact: true }).fill(y);
}

test("shows hand-worked scales and plotted points on a narrow screen", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1", "2");
  await fillRow(page, 2, "2", "4");
  await fillRow(page, 3, "3", "6");
  await page
    .getByRole("button", { name: "Show scaling and preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "X axis scaling", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Y axis scaling", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("X axis result", { exact: true })).toContainText(
    "0.2",
  );
  await expect(page.getByLabel("Y axis result", { exact: true })).toContainText(
    "0.5",
  );
  await expect(
    page.getByRole("heading", { name: "Graph preview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("img")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("graph.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("explains incomplete and nonnumeric cells without discarding entries", async ({
  page,
}) => {
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1", "");
  await fillRow(page, 2, "not a number", "4");
  await page
    .getByRole("button", { name: "Show scaling and preview", exact: true })
    .click();
  await expect(
    page.getByLabel("Row 1, y value", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByLabel("Row 2, x value", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Row 1, x value", { exact: true })).toHaveValue(
    "1",
  );
  await expect(page.getByLabel("Row 2, x value", { exact: true })).toHaveValue(
    "not a number",
  );
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Graph preview", exact: true }),
  ).toHaveCount(0);
  await fillRow(page, 1, "1", "2");
  await fillRow(page, 2, "2", "4");
  await page
    .getByRole("button", { name: "Show scaling and preview", exact: true })
    .click();
  await expect(page.getByRole("img")).toBeVisible();
});

test("accepts decimal commas and ignores completely empty rows", async ({
  page,
}) => {
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1,5", "-2,5");
  await fillRow(page, 2, "2,5", "-1,5");
  await page
    .getByRole("button", { name: "Show scaling and preview", exact: true })
    .click();
  await expect(page.getByRole("img")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Row 1, x value", { exact: true })).toHaveValue(
    "1,5",
  );
  await expect(page.getByLabel("X axis result", { exact: true })).toContainText(
    "0.1",
  );
});

test("adds and removes rows and invalidates an outdated preview after editing", async ({
  page,
}) => {
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1", "2");
  await fillRow(page, 2, "2", "4");
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(
    page.getByLabel("Row 4, x value", { exact: true }),
  ).toBeVisible();
  await fillRow(page, 4, "3", "6");
  await page.getByRole("button", { name: "Remove row 3", exact: true }).click();
  await expect(page.getByLabel("Row 3, x value", { exact: true })).toHaveValue(
    "3",
  );
  await expect(page.getByLabel("Row 4, x value", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Show scaling and preview", exact: true })
    .click();
  await expect(page.getByRole("img")).toBeVisible();
  await page.getByLabel("Row 1, y value", { exact: true }).fill("3");
  await expect(
    page.getByRole("heading", { name: "Graph preview", exact: true }),
  ).toHaveCount(0);
});

test("restores the account draft after refresh, including invalid entries", async ({
  page,
}) => {
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1,5", "still measuring");
  await page.getByLabel("X grid boxes", { exact: true }).fill("12");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        localStorage.getItem("physics-graph-draft:v1:test-student"),
      ),
    )
    .toContain("still measuring");
  await page.reload();
  await expect(page.getByLabel("Graph title", { exact: true })).toHaveValue(
    "Extension against force",
  );
  await expect(page.getByLabel("Row 1, x value", { exact: true })).toHaveValue(
    "1,5",
  );
  await expect(page.getByLabel("Row 1, y value", { exact: true })).toHaveValue(
    "still measuring",
  );
  await expect(page.getByLabel("X grid boxes", { exact: true })).toHaveValue(
    "12",
  );
  await expect(
    page.getByRole("heading", { name: "Graph preview", exact: true }),
  ).toHaveCount(0);
});

test("reports unavailable draft storage while keeping the current table usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1", "2");
  await fillRow(page, 2, "2", "4");
  await page
    .getByRole("button", { name: "Show scaling and preview", exact: true })
    .click();
  await expect(page.getByRole("img")).toBeVisible();
  await expect(page.getByLabel("Row 1, x value", { exact: true })).toHaveValue(
    "1",
  );
  await expect(
    page.getByRole("status").filter({ hasText: /draft.*could not/i }),
  ).toBeVisible();
});

test("points a y-axis precision error to the y grid-box field", async ({
  page,
}) => {
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1", "1");
  await fillRow(page, 2, "2", "1.0000000000000002");
  await page
    .getByRole("button", { name: "Show scaling and preview", exact: true })
    .click();
  await expect(
    page.getByLabel("Y grid boxes", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByLabel("X grid boxes", { exact: true }),
  ).toHaveAttribute("aria-invalid", "false");
  const errorLink = page
    .getByRole("alert")
    .getByRole("link", { name: /^Y axis:/ });
  await expect(errorLink).toBeVisible();
  await errorLink.click();
  await expect(page.getByLabel("Y grid boxes", { exact: true })).toBeFocused();
  await expect(page.getByRole("img")).toHaveCount(0);
});

test("allows a single point while explaining its limitation", async ({
  page,
}) => {
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "2", "5");
  await page
    .getByRole("button", { name: "Show scaling and preview", exact: true })
    .click();
  await expect(
    page.getByText(/one data point.*cannot show a trend/i),
  ).toBeVisible();
  await expect(page.getByRole("img")).toBeVisible();
  await expect(page.getByLabel("X axis result", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Y axis result", { exact: true })).toBeVisible();
});

test("a queued cross-tab event reads the latest stored draft instead of stale event data", async ({
  page,
}) => {
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1", "2");
  await page.evaluate(() => {
    const key = "physics-graph-draft:v1:test-student";
    const current = JSON.parse(localStorage.getItem(key)!);
    const stale = JSON.stringify({ ...current, title: "An older tab edit" });
    const latest = JSON.stringify({ ...current, title: "The latest tab edit" });
    localStorage.setItem(key, latest);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        newValue: stale,
        storageArea: localStorage,
      }),
    );
  });
  await expect(page.getByLabel("Graph title", { exact: true })).toHaveValue(
    "The latest tab edit",
  );
  await expect(page.getByLabel("Row 1, x value", { exact: true })).toHaveValue(
    "1",
  );
  await expect(
    page.getByRole("status").filter({ hasText: /another tab/i }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("physics-graph-draft:v1:test-student")!)
          .title,
    ),
  ).toBe("The latest tab edit");
});

test("does not restore another account’s draft on a shared browser", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "physics-graph-draft:v1:another-student",
      JSON.stringify({
        title: "Another student’s measurements",
        xLabel: "Private X",
        xUnit: "m",
        yLabel: "Private Y",
        yUnit: "s",
        xBoxes: "10",
        yBoxes: "10",
        rows: [{ id: "private-row", x: "123", y: "456" }],
      }),
    );
  });
  await page.goto("/");
  await expect(page.getByLabel("Graph title", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("X variable", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Row 1, x value", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByLabel("Row 3, x value", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("physics-graph-draft:v1:test-student"),
    ),
  ).toBeNull();
});

test("draft removal in another tab clears this table and navigates to login without restoring the draft", async ({
  page,
}) => {
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1", "2");
  await page.route("http://127.0.0.1:3001/login", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><body><h1>Log in</h1></body></html>',
    }),
  );
  await page.evaluate(() => {
    const key = "physics-graph-draft:v1:test-student";
    localStorage.removeItem(key);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        newValue: null,
        storageArea: localStorage,
      }),
    );
  });
  await expect(page).toHaveURL("http://127.0.0.1:3001/login");
  await expect(
    page.getByRole("heading", { name: "Log in", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("physics-graph-draft:v1:test-student"),
    ),
  ).toBeNull();
});

test("a failed preview can be retried without editing or losing the table", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1", "2");
  await fillRow(page, 2, "2", "4");
  await page.evaluate(() => {
    const original = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function () {
      CanvasRenderingContext2D.prototype.measureText = original;
      throw new Error("Test-only failure while constructing the chart");
    };
  });
  await page
    .getByRole("button", { name: "Show scaling and preview", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "The preview could not be drawn",
  );
  await expect(page.getByLabel("Row 1, x value", { exact: true })).toHaveValue(
    "1",
  );
  await expect(page.getByLabel("X axis result", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Show scaling and preview", exact: true })
    .click();
  await expect(page.getByRole("img")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("edits in a real second tab update the first tab with the last stored values", async ({ page, context }) => {
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1", "2");
  const second = await context.newPage();
  await second.goto("http://127.0.0.1:3001/");
  await expect(second.getByLabel("Graph title", { exact: true })).toHaveValue("Extension against force");
  await second.getByLabel("Graph title", { exact: true }).fill("Last edit from the second tab");
  await second.getByLabel("Row 1, y value", { exact: true }).fill("9");
  await expect(page.getByLabel("Graph title", { exact: true })).toHaveValue("Last edit from the second tab");
  await expect(page.getByLabel("Row 1, y value", { exact: true })).toHaveValue("9");
  await expect(page.getByRole("status").filter({ hasText: /another tab/i })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("physics-graph-draft:v1:test-student")!).rows[0].y)).toBe("9");
});

test("a successful logout through the real account form removes the draft in both tabs", async ({ page, context }) => {
  await context.route("http://127.0.0.1:3001/api/auth/logout", route => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ redirect: "/login" }),
  }));
  await page.goto("/");
  await fillGraphDetails(page);
  await fillRow(page, 1, "1", "2");
  const second = await context.newPage();
  await second.goto("http://127.0.0.1:3001/");
  await expect(second.getByLabel("Graph title", { exact: true })).toHaveValue("Extension against force");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3001/login");
  await expect(second).toHaveURL("http://127.0.0.1:3001/login");
  for (const tab of [page, second]) {
    expect(await tab.evaluate(() => localStorage.getItem("physics-graph-draft:v1:test-student"))).toBeNull();
    await expect(tab.getByLabel("Graph title", { exact: true })).toHaveValue("");
    await expect(tab.getByLabel("Row 1, x value", { exact: true })).toHaveValue("");
  }
});
