import { test, expect, _electron, type ElectronApplication, type Page } from "@playwright/test";
import path from "node:path";

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await _electron.launch({
    args: [path.resolve("out/main/index.js")],
    env: { ...process.env, NODE_ENV: "production" }
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
});

test("app window opens and renders main layout", async () => {
  // Verify the sidebar and workbench panels are present
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.locator(".center-panel")).toBeVisible();
});

test("workspace sidebar has webkit scrollbar styling", async () => {
  const container = page.locator(".workspace-list");
  await expect(container).toBeVisible();

  // Verify overflow is set to overlay (Chromium may compute it as "overlay" or "auto")
  const overflowY = await container.evaluate((el) => {
    const style = getComputedStyle(el);
    return style.overflowY;
  });
  expect(["overlay", "auto"]).toContain(overflowY);

  // Verify the source CSS actually declares overlay (not auto)
  const declaredOverflow = await container.evaluate((el) => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSStyleRule && el.matches(rule.selectorText)) {
            const val = rule.style.getPropertyValue("overflow");
            if (val === "overlay") return "overlay";
            const valY = rule.style.getPropertyValue("overflow-y");
            if (valY === "overlay") return "overlay";
          }
        }
      } catch {
        // cross-origin sheets
      }
    }
    return null;
  });
  expect(declaredOverflow).toBe("overlay");
});

test("scrollbar thumb is transparent by default (invisible until hover)", async () => {
  const container = page.locator(".workspace-list");
  await expect(container).toBeVisible();

  // Inject overflow content to force a scrollbar
  await container.evaluate((el) => {
    const filler = document.createElement("div");
    filler.id = "test-filler";
    filler.style.height = "10000px";
    el.appendChild(filler);
  });
  await page.waitForTimeout(200);

  // The webkit scrollbar thumb should be transparent (invisible) by default
  const thumbBg = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (
            rule instanceof CSSStyleRule &&
            rule.selectorText.includes(".workspace-list::-webkit-scrollbar-thumb")
          ) {
            return rule.style.getPropertyValue("background");
          }
        }
      } catch {
        // cross-origin sheets
      }
    }
    return null;
  });
  expect(thumbBg).toContain("transparent");

  // Clean up
  await container.evaluate((el) => {
    el.querySelector("#test-filler")?.remove();
  });
});

test("main navigation tabs are present", async () => {
  const nav = page.locator("nav");
  await expect(nav).toBeVisible();
  await expect(nav.locator("button", { hasText: "terminal" })).toBeVisible();
  await expect(nav.locator("button", { hasText: "skills" })).toBeVisible();
  await expect(nav.locator("button", { hasText: "config" })).toBeVisible();
  await expect(nav.locator("button", { hasText: "settings" })).toBeVisible();
});

test("can switch to skills tab", async () => {
  await page.locator("nav button", { hasText: "skills" }).click();
  await expect(page.locator(".skills-panel")).toBeVisible();
});

test("can switch to config tab", async () => {
  await page.locator("nav button", { hasText: "config" }).click();
  await expect(page.locator(".agent-config-panel")).toBeVisible();
});

test("can switch back to terminal tab", async () => {
  await page.locator("nav button", { hasText: "terminal" }).click();
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.locator(".center-panel")).toBeVisible();
});
