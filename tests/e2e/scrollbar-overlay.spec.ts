import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closeHeadlessElectronTestApp, launchHeadlessElectronTestApp } from "./headlessElectronApp";

let app: ElectronApplication;
let page: Page;
let testHomeDir = "";

test.beforeEach(async () => {
  testHomeDir = mkdtempSync(path.join(tmpdir(), "watchboard-e2e-home-"));
  writeSkillFixture(testHomeDir, "base-skill", "Base skill", "Base skill used to seed the list");
  app = await launchHeadlessElectronTestApp({
    env: {
      HOME: testHomeDir
    }
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterEach(async () => {
  await closeHeadlessElectronTestApp(app);
  if (testHomeDir) {
    rmSync(testHomeDir, { recursive: true, force: true });
    testHomeDir = "";
  }
});

async function waitForAppReady(): Promise<void> {
  await expect(page.getByRole("navigation", { name: "Main sections" })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "terminal", exact: true }).click();
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.locator(".center-panel")).toBeVisible();
}

test("app window opens and renders main layout", async () => {
  await waitForAppReady();
});

test("workspace sidebar has webkit scrollbar styling", async () => {
  await waitForAppReady();
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
  await waitForAppReady();
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
  await waitForAppReady();
  await page.getByRole("navigation").getByRole("button", { name: "skills", exact: true }).click();
  await expect(page.locator(".skills-panel")).toBeVisible();
});

test("can switch to config tab", async () => {
  await waitForAppReady();
  await page.getByRole("navigation").getByRole("button", { name: "config", exact: true }).click();
  await expect(page.getByText("Agent Config", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Codex Config", exact: true })).toBeVisible();
});

test("can switch back to terminal tab", async () => {
  await waitForAppReady();
  await page.getByRole("navigation").getByRole("button", { name: "terminal", exact: true }).click();
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.locator(".center-panel")).toBeVisible();
});

test("settings categories switch content from the left sidebar", async () => {
  await waitForAppReady();
  await page.getByRole("navigation").getByRole("button", { name: "settings", exact: true }).click();
  await expect(page.locator(".settings-panel")).toBeVisible();
  await expect(page.getByText("Global Settings")).toBeVisible();

  const sidebar = page.getByRole("tablist", { name: "Settings categories" });
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Board\b/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Environments\b/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Debug\b/ })).toBeVisible();

  const heading = page.getByRole("heading", { level: 2 });
  await page.getByRole("tab", { name: /^Board\b/ }).click();
  await expect(heading).toHaveText("Shared Board");

  await page.getByRole("tab", { name: /^Environments\b/ }).click();
  await expect(heading).toHaveText("Environment Management");
  await expect(page.getByText("SSH Environments", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /^Debug\b/ }).click();
  await expect(heading).toHaveText("Debug Paths");
});

test("skills pane refresh discovers skill entries added after initial load", async () => {
  await waitForAppReady();
  await page.getByRole("navigation").getByRole("button", { name: "skills", exact: true }).click();
  await expect(page.locator(".skills-panel")).toBeVisible();
  await expect(page.locator(".skills-list")).toContainText("Base skill");
  const refreshButton = page.locator(".skills-panel-toolbar .secondary-button");
  await expect(refreshButton).toBeVisible();
  await expect(refreshButton).toBeEnabled();

  writeSkillFixture(testHomeDir, "issue-created-skill", "Issue-created skill", "Added after app launch");
  await refreshButton.click();

  await expect(page.locator(".skills-list")).toContainText("Issue-created skill");
});

function writeSkillFixture(homeDir: string, folderName: string, title: string, description: string): void {
  const skillDir = path.join(homeDir, ".codex", "skills", folderName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${title}\ndescription: ${description}\n---\n\n# ${title}\n`,
    "utf8"
  );
}
