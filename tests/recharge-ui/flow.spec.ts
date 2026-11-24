import { expect, test, type Page, type Route } from "@playwright/test";

const id = "00000000-0000-4000-8000-000000000011";
const reference = "FND-TEST-RECHARGE-001";
const pins = ["0012345678901234", "0012345678901235"].map((pin, index) => ({ pin, serial: `TEST-${index + 1}`, network: "mtn", amount: 100, dialCode: `*311*${pin}#` }));
const receipt = {
  transactionId: id, reference, providerReference: "PROVIDER-TEST-001", status: "successful",
  amount: 196, balance: 9805.96, refunded: false, productName: "MTN recharge cards × 2",
  destination: "MTN recharge cards", serviceType: "airtime", mode: "epin", network: "mtn",
  quantity: 2, unitAmount: 100, faceValue: 200, discount: 4, cashback: 1.96, quotedCashback: 1.96,
  deliveryStatus: "ready", pinCount: 2, pins, cardName: "Funda", createdAt: "2026-11-23T08:00:00.000Z",
};

async function mockApis(page: Page, custom?: (route: Route, path: string) => Promise<boolean>) {
  // All customer APIs are intercepted: these tests cannot buy cards or move money.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (await custom?.(route, path)) return;
    let body: unknown = { products: [], beneficiaries: [], account: null, balance: 10000, thread: null, offers: [] };
    if (path.endsWith("/recharge-cards/catalog")) body = { offers: [100, 200, 500, 1000].map((denomination) => ({ network: "mtn", denomination, maxQuantity: 20 })) };
    if (path.endsWith("/recharge-cards/quote")) {
      const input = route.request().postDataJSON();
      const faceValue = input.denomination * input.quantity;
      const discount = faceValue * 0.02;
      const payable = faceValue - discount;
      body = { ...input, faceValue, discount, payable, cashback: Math.round(payable) / 100, discountPercentage: 2, cashbackPercentage: 1, quoteId: "a".repeat(64), ruleId: id };
    }
    if (path.endsWith(`/transactions/${id}`)) body = { purchase: receipt, balance: receipt.balance };
    if (path.endsWith("/recharge-cards/orders")) body = { orders: [], nextCursor: null };
    await route.fulfill({ json: body });
  });
  await page.addInitScript(() => localStorage.setItem("funda-theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
}

async function openCards(page: Page) {
  await page.goto("/admin-preview/recharge");
  await page.getByRole("button", { name: "Services", exact: true }).click();
  await page.getByRole("button", { name: /Recharge PINs/ }).click();
  await expect(page.getByRole("group", { name: "Airtime purchase type" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Funda live support chat" })).toBeHidden();
}

async function chooseTwoCards(page: Page) {
  await page.getByRole("button", { name: "₦100", exact: true }).click();
  const quantity = page.getByRole("button", { name: "Recharge-card quantity" });
  await quantity.press("ArrowDown");
  await quantity.press("ArrowDown");
  await quantity.press("Enter");
  await expect(page.getByRole("button", { name: "Generate 2 Recharge PINs • ₦196", exact: true })).toBeEnabled();
}

test("checkout prices savings correctly and retries a lost response with the same request key", async ({ page }, testInfo) => {
  const requests: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockApis(page, async (route, path) => {
    if (!path.endsWith("/services/purchase")) return false;
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) await route.abort("failed");
    else await route.fulfill({ status: 200, json: { ...receipt, reused: true } });
    return true;
  });
  await openCards(page);
  await chooseTwoCards(page);
  await expect(page.getByText("Cashback on completion", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("checkout.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Generate 2 Recharge PINs • ₦196", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /fetch|network|purchase/i })).toBeVisible();
  await page.getByRole("button", { name: "Generate 2 Recharge PINs • ₦196", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download cards", exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0].idempotencyKey).toBe(requests[1].idempotencyKey);
  expect(requests[1]).toMatchObject({ amount: 200, quantity: 2, mode: "epin", quoteId: "a".repeat(64) });
  await expect(page.getByText("0012 3456 7890 1234", { exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download cards", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`funda-cards-${reference}.html`);
  await page.screenshot({ path: testInfo.outputPath("receipt.png"), fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});

test("unavailable pricing prevents checkout", async ({ page }) => {
  await mockApis(page, async (route, path) => {
    if (!path.endsWith("/recharge-cards/quote")) return false;
    await route.fulfill({ status: 503, json: { error: "Recharge-card pricing is under review." } });
    return true;
  });
  await openCards(page);
  await expect(page.getByRole("alert").filter({ hasText: "pricing is under review" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate Recharge PIN/ })).toBeDisabled();
});

test("partial delivery stays in review without revealing or printing an incomplete batch", async ({ page }, testInfo) => {
  await mockApis(page, async (route, path) => {
    if (!path.endsWith(`/transactions/${id}`)) return false;
    await route.fulfill({ json: { purchase: { ...receipt, status: "pending", deliveryStatus: "partial_pin_batch", pinCount: 1, pins: undefined, cashback: 0 } } });
    return true;
  });
  await page.goto("/admin-preview/recharge");
  await page.getByRole("button", { name: /MTN ₦100 recharge cards × 2/ }).click();
  await expect(page.getByText("Partial delivery", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check Status", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download cards", exact: true })).toHaveCount(0);
  await expect(page.getByText("0012 3456 7890 1234", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("pending-receipt.png"), fullPage: true, animations: "disabled" });
});

test("card history loads older owned orders and searches by reference", async ({ page }) => {
  const queries: URL[] = [];
  await mockApis(page, async (route, path) => {
    if (!path.endsWith("/recharge-cards/orders")) return false;
    const url = new URL(route.request().url());
    queries.push(url);
    await route.fulfill({ json: { orders: [], nextCursor: url.searchParams.has("cursor") ? null : "fixture-cursor" } });
    return true;
  });
  await page.goto("/admin-preview/recharge");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("tab", { name: /Recharge cards/ }).click();
  await page.getByRole("button", { name: "Load older cards", exact: true }).click();
  await expect.poll(() => queries.some((url) => url.searchParams.get("cursor") === "fixture-cursor")).toBe(true);
  await page.getByPlaceholder("Search recharge reference…").fill("FND-TEST");
  await expect.poll(() => queries.some((url) => url.searchParams.get("q") === "FND-TEST")).toBe(true);
});

test("admin offers use a custom menu and reserve room for verified cost", async ({ page }, testInfo) => {
  await mockApis(page);
  await page.goto("/admin-preview/recharge?view=admin");
  await expect(page.getByRole("region", { name: "Recharge-card analytics, last 30 days" })).toBeVisible();
  await page.getByRole("button", { name: "Add cards", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Verified provider cost per card (₦)", { exact: true })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("admin-add-cards.png"), fullPage: true, animations: "disabled" });
});

test("admin recovery prevents a refund on partially issued cards", async ({ page }, testInfo) => {
  await mockApis(page);
  await page.goto("/admin-preview/recharge?view=recovery");
  await page.getByRole("button", { name: "Recharge-card resolution" }).click();
  await expect(page.getByRole("option", { name: "Recover provider PINs", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: /Confirm non-delivery/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: testInfo.outputPath("admin-recovery.png"), fullPage: true, animations: "disabled" });
});
