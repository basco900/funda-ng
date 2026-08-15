import { expect, test } from "@playwright/test";

test.describe("Funda onboarding", () => {
  test("fills the viewport and advances through stories", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Funda home" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /More data\. Less money\./ })).toBeVisible();

    const viewportFit = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    expect(viewportFit.bodyWidth).toBeLessThanOrEqual(viewportFit.viewportWidth);
    expect(viewportFit.bodyHeight).toBeLessThanOrEqual(viewportFit.viewportHeight);

    await page.getByRole("button", { name: "Next story" }).click();
    await expect(page.getByRole("heading", { name: /Recharge\. Just like that\./ })).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("heading", { name: /Lights on\. Stress off\./ })).toBeVisible();

    await page.getByRole("button", { name: "Show story 4: Why pay more?" }).click();
    await expect(page.getByRole("heading", { name: "Why pay more?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next story" })).toHaveCount(0);
  });

  test("autoplays when there has been no manual interaction", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /More data\. Less money\./ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Recharge\. Just like that\./ })).toBeVisible({ timeout: 7_500 });
  });

  test("supports wheel navigation and honors reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator('html[data-funda-ready="true"]')).toBeAttached();
    await page.locator("main").dispatchEvent("wheel", { deltaY: 420 });
    await expect(page.getByRole("heading", { name: /Recharge\. Just like that\./ })).toBeVisible();

    await page.waitForTimeout(6_300);
    await expect(page.getByRole("heading", { name: /Recharge\. Just like that\./ })).toBeVisible();
  });

  test("supports a vertical touch gesture", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "Touch gesture is covered by the mobile project.");
    await page.goto("/");
    const experience = page.locator("main");
    await experience.dispatchEvent("touchstart", {
      touches: [{ identifier: 1, clientX: 190, clientY: 610 }],
    });
    await experience.dispatchEvent("touchend", {
      changedTouches: [{ identifier: 1, clientX: 190, clientY: 420 }],
    });
    await expect(page.getByRole("heading", { name: /Recharge\. Just like that\./ })).toBeVisible();
  });

  test("completes the registration design preview without creating a session", async ({ page }) => {
    await page.goto("/register");
    const dialog = page.locator('[role="dialog"]:visible');
    await expect(dialog.getByText(/no SMS or account will be created/i)).toBeVisible();

    const phone = dialog.getByLabel("Email or phone number");
    await phone.fill("08012345678");
    await dialog.getByRole("button", { name: /Continue/ }).click();

    const otp = dialog.getByLabel("Six-digit code");
    await otp.fill("000000");
    await dialog.getByRole("button", { name: /Verify code/ }).click();
    await expect(dialog.getByRole("alert")).toContainText("123456");

    await otp.fill("123456");
    await dialog.getByRole("button", { name: /Verify code/ }).click();
    await dialog.getByLabel("First name").fill("Ada");
    await dialog.getByRole("button", { name: /Finish preview/ }).click();

    await expect(dialog.getByRole("heading", { name: "Looking good, Ada." })).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);

    await dialog.getByRole("button", { name: /Return to Funda/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("opens and closes the login preview through public routes", async ({ page }) => {
    await page.goto("/");
    await page.locator("button:visible").filter({ hasText: "Log in" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    const dialog = page.locator('[role="dialog"]:visible');
    await expect(dialog.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
    await dialog.getByRole("button", { name: "Close preview" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("opens authentication without remounting or shifting the story", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const story = page.locator("section", { has: page.getByRole("heading", { name: /More data\. Less money\./ }) });
    await story.evaluate((element) => { element.setAttribute("data-persistence-check", "stable"); });
    const before = await story.boundingBox();

    await page.getByRole("button", { name: "Create account" }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.locator('[role="dialog"]:visible')).toBeVisible();
    await expect(story).toHaveAttribute("data-persistence-check", "stable");
    expect(await story.boundingBox()).toEqual(before);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[role="dialog"]:visible')).toHaveCount(0);
  });

  test("has stable first-screen visuals", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /More data\. Less money\./ })).toBeVisible();
    await expect(page).toHaveScreenshot("funda-first-screen.png", { fullPage: true });

    await page.goto("/register");
    await expect(page.locator('[role="dialog"]:visible').getByRole("heading", { name: "Start with your number." })).toBeVisible();
    await expect(page).toHaveScreenshot("funda-register-preview.png", { fullPage: true });
  });
});

test("health and manifest endpoints are production-ready", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toEqual({ status: "ok", service: "funda-web" });

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ name: "Funda", display: "standalone", start_url: "/" });
});
