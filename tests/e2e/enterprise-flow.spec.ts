import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "e2e-admin@example.test";
const ADMIN_PASSWORD = "E2ePassw0rd!Test";

async function mockCalls(request: import("@playwright/test").APIRequestContext) {
  const response = await request.get("http://127.0.0.1:4009/__calls");
  return (await response.json()) as { emailCalls: number; storedFiles: number };
}

test("customer → product → invoice → PDF → email → payment → report", async ({ page, request }) => {
  const suffix = Date.now();
  const customerName = `E2E Customer ${suffix}`;
  const productName = `E2E Product ${suffix}`;
  const customerEmail = `customer-${suffix}@example.test`;

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in$/);

  await page.goto("/customers");
  await page.locator("#customer-name").fill(customerName);
  await page.locator("#customer-email").fill(customerEmail);
  await page.locator("#customer-state").fill("KA");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByText(customerName)).toBeVisible();

  await page.goto("/products");
  await page.locator("#product-name").fill(productName);
  await page.locator("#product-sku").fill(`E2E${suffix}`.slice(0, 20));
  await page.locator("#product-price").fill("250");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText(productName)).toBeVisible();

  await page.goto("/invoices/new");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("textbox", { name: "Customer search" }).fill(customerName);
  await page.getByRole("option", { name: new RegExp(customerName) }).click();
  await page.getByRole("combobox", { name: "Product for line 1" }).click();
  await page.getByRole("textbox", { name: "Product for line 1 search" }).fill(productName);
  await page.getByRole("option", { name: new RegExp(productName) }).click();
  await page.locator('[id="lines.0.quantity"]').fill("2");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Download" }).click();
  await expect.poll(async () => (await mockCalls(request)).storedFiles, { timeout: 60_000 }).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Send invoice", exact: true }).click();
  await page.locator("#email-to").fill("recipient@example.test");
  await page.locator("#email-subject").fill(`Invoice for ${customerName}`);
  await page.getByRole("dialog").getByRole("button", { name: "Send invoice" }).click();
  await expect(page.getByText("Invoice sent with PDF")).toBeVisible();
  await expect.poll(async () => (await mockCalls(request)).emailCalls).toBeGreaterThan(0);

  await page.getByRole("button", { name: /More actions for INV-/ }).click();
  await page.getByRole("menuitem", { name: "Mark as viewed" }).click();
  await expect(page.getByText("Invoice marked as viewed")).toBeVisible();

  await page.getByRole("button", { name: /More actions for INV-/ }).click();
  await page.getByRole("menuitem", { name: "Record payment" }).click();
  await page.locator("#payment-amount").fill("100");
  await page.locator("#payment-date").fill(new Date().toISOString().slice(0, 10));
  await page.locator("#payment-method").click();
  await page.getByRole("option", { name: "BANK TRANSFER" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();

  await page.goto("/reports");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText("Sales report")).toBeVisible();
});
