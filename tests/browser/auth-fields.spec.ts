import { test, expect } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:3001" });

test('Enter submission keeps email guidance visible after resetting the form', async ({ page }) => {
  await page.route('**/api/auth/forgot-password', route => route.fulfill({ json: { message: 'Check your spam folder. Your reset link is on its way.', cooldown: 60 } }));
  await page.goto('/?auth=forgot-password');
  const form = page.getByRole('region', { name: 'Account form' });
  const email = form.getByLabel('Email address');
  await email.fill('student@lab.edu');
  await email.press('Enter');
  const status = form.getByRole('status');
  await expect(status).toBeFocused();
  await expect(status).toContainText('Check your spam folder.');
  await expect(email).toHaveValue('');
  await expect(email).toHaveAttribute('aria-invalid', 'false');
});

test("signup fields validate while typing and confirmation follows password edits", async ({
  page,
}) => {
  await page.goto("/?auth=signup");
  const form = page.getByRole("region", { name: "Account form" });
  const email = form.getByLabel("Email address", { exact: true });
  const password = form.getByLabel("Password", { exact: true });
  const confirm = form.getByLabel("Confirm password", { exact: true });
  await expect(email).toHaveAttribute("aria-invalid", "false");
  await email.fill("not-an-email");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(
    form.getByText("Enter a valid email address.", { exact: true }),
  ).toBeVisible();
  await email.fill("student@lab.edu");
  await expect(email).toHaveAttribute("aria-invalid", "false");
  await password.fill("short");
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(confirm).toHaveAttribute("aria-invalid", "false");
  await password.fill("GoodPassword123");
  await confirm.fill("OtherPassword123");
  await expect(confirm).toHaveAttribute("aria-invalid", "true");
  await confirm.fill("GoodPassword123");
  await expect(confirm).toHaveAttribute("aria-invalid", "false");
  await password.fill("ChangedPassword123");
  await expect(confirm).toHaveAttribute("aria-invalid", "true");
  await expect(
    form.getByText("The passwords do not match.", { exact: true }),
  ).toBeVisible();
});

test("invalid account submissions stay local and focus the first invalid field", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/auth/signup", (route) => {
    requests++;
    return route.fulfill({ json: { message: "Check your inbox." } });
  });
  await page.goto("/?auth=signup");
  const form = page.getByRole("region", { name: "Account form" });
  await form
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(form.getByLabel("Email address")).toBeFocused();
  await expect(form.getByLabel("Confirm password")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(requests).toBe(0);
  await form.getByLabel("Email address").fill("student@lab.edu");
  await form.getByLabel("Password", { exact: true }).fill("GoodPassword123");
  await form.getByLabel("Confirm password").fill("GoodPassword123");
  await form
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(form.getByRole("status")).toHaveText("Check your inbox.");
  expect(requests).toBe(1);
  await expect(form.getByLabel("Email address")).toHaveValue("");
  await expect(form.getByLabel("Password", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "false",
  );
});

test("current password and deletion confirmation validate independently", async ({
  page,
}) => {
  await page.goto("/?auth=delete-account");
  const form = page.getByRole("region", { name: "Account form" });
  const current = form.getByLabel("Current password");
  const confirmation = form.getByLabel("Type DELETE to confirm");
  await current.focus();
  await confirmation.focus();
  await expect(current).toHaveAttribute("aria-invalid", "true");
  await confirmation.fill("delete");
  await expect(confirmation).toHaveAttribute("aria-invalid", "true");
  await current.fill("old");
  await expect(current).toHaveAttribute("aria-invalid", "false");
  await expect(confirmation).toHaveAttribute("aria-invalid", "true");
  await confirmation.fill("DELETE");
  await expect(confirmation).toHaveAttribute("aria-invalid", "false");
});
