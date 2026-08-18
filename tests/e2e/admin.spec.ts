import { expect, test } from "@playwright/test";

test.describe("Funda Admin security boundary", () => {
  test("renders the dedicated admin sign-in without exposing server secrets", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { name: /welcome to admin/i })).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.locator("body")).not.toContainText("SUPABASE_SECRET_KEY");
  });

  test("redirects unauthenticated console requests to admin login", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("rejects unauthenticated admin APIs", async ({ request }) => {
    const [search, summary] = await Promise.all([
      request.get("/api/admin/search?q=customer"),
      request.get("/api/admin/operations/summary"),
    ]);
    expect(search.status()).toBe(401);
    expect(summary.status()).toBe(401);
    expect(await search.json()).toEqual({ error: "Unauthorized" });
  });
});
