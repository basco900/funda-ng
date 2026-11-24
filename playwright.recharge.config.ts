import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/recharge-ui",
  fullyParallel: true,
  workers: 2,
  timeout: 45000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3001",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-light", use: { viewport: { width: 1440, height: 1000 }, colorScheme: "light" } },
    { name: "mobile-dark", use: { viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "npm run dev:3001",
    url: "http://localhost:3001/admin-preview/recharge",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
