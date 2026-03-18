import { defineConfig } from "@playwright/test";

const isCi = process.env.CI === "1" || process.env.CI === "true";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  fullyParallel: false,
  reporter: isCi ? [["line"]] : [["html", { open: "never" }]],
  use: {
    screenshot: isCi ? "off" : "only-on-failure",
    trace: isCi ? "off" : "retain-on-failure"
  }
});
