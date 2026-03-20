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
  expect(thumbBg, "scrollbar-thumb CSS rule should exist").not.toBeNull();
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
  await expect(nav.locator("button", { hasText: "analysis" })).toBeVisible();
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

test("can switch to analysis tab and see analysis panel guidance", async () => {
  await waitForAppReady();
  await page.getByRole("navigation").getByRole("button", { name: "analysis", exact: true }).click();
  await expect(page.locator(".analysis-panel")).toBeVisible();
  await expect(page.getByText("Profiler database not found")).toBeVisible();
  await expect(page.getByText(/Install agent-trajectory-profiler to generate .*profiler\.db/i)).toBeVisible();
});

test("analysis pane keeps the body and session list scrollable inside the single-view shell", async () => {
  await waitForAppReady();
  await page.getByRole("navigation").getByRole("button", { name: "analysis", exact: true }).click();
  await expect(page.locator(".single-view-panel")).toBeVisible();

  await injectAnalysisScrollFixture(page);

  const metrics = await measureAnalysisFixture(page);
  expect(metrics.body.overflowY).toBe("auto");
  expect(metrics.body.scrollHeight).toBeGreaterThan(metrics.body.clientHeight);
  expect(metrics.body.scrollTop).toBeGreaterThan(0);
  expect(metrics.body.lastVisible).toBe(true);
  expect(metrics.sessions.scrollHeight).toBeGreaterThan(metrics.sessions.clientHeight);
  expect(metrics.sessions.scrollTop).toBeGreaterThan(0);
  expect(metrics.sessions.lastVisible).toBe(true);
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

async function injectAnalysisScrollFixture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.querySelector(".single-view-panel");
    if (!(host instanceof HTMLElement)) {
      throw new Error("single-view-panel host not found");
    }

    const kpis = Array.from({ length: 8 }, (_, index) => `<article class="analysis-card"><strong>KPI ${index + 1}</strong></article>`).join("");
    const sessions = Array.from(
      { length: 40 },
      (_, index) => `
        <button class="analysis-session-item"${index === 39 ? ' data-test-analysis-session="last"' : ""}>
          <strong>Session ${index + 1}</strong>
          <span>synthetic fixture</span>
        </button>
      `
    ).join("");
    const detailCards = Array.from(
      { length: 14 },
      (_, index) => `
        <article class="analysis-card"${index === 13 ? ' data-test-analysis-card="last"' : ""}>
          <div class="analysis-card-header"><strong>Section ${index + 1}</strong></div>
          <div style="height: 160px"></div>
        </article>
      `
    ).join("");

    host.innerHTML = `
      <div class="analysis-panel">
        <header class="analysis-panel-header">
          <div>
            <p class="panel-eyebrow">Analysis</p>
            <div class="analysis-panel-status">
              <span class="analysis-status-pill is-ready">READY</span>
              <code>~/.agent-vis/profiler.db</code>
            </div>
            <p class="analysis-panel-copy">Synthetic scroll fixture</p>
          </div>
          <div class="analysis-panel-toolbar">
            <button class="compact-control-button" type="button">Overview</button>
          </div>
        </header>
        <div class="analysis-panel-body">
          <section class="analysis-kpi-grid">${kpis}</section>
          <section class="analysis-layout">
            <article class="analysis-card analysis-sidebar">
              <div class="analysis-card-header">
                <strong>Sessions</strong>
              </div>
              <div class="analysis-session-list">${sessions}</div>
            </article>
            <div class="analysis-main">${detailCards}</div>
          </section>
        </div>
      </div>
    `;
  });
}

async function measureAnalysisFixture(page: Page): Promise<{
  body: { clientHeight: number; overflowY: string; scrollHeight: number; scrollTop: number; lastVisible: boolean };
  sessions: { clientHeight: number; scrollHeight: number; scrollTop: number; lastVisible: boolean };
}> {
  return page.evaluate(async () => {
    const body = document.querySelector(".analysis-panel-body");
    const sessionList = document.querySelector(".analysis-session-list");
    const lastBodyCard = document.querySelector('[data-test-analysis-card="last"]');
    const lastSession = document.querySelector('[data-test-analysis-session="last"]');

    if (!(body instanceof HTMLElement) || !(sessionList instanceof HTMLElement) || !(lastBodyCard instanceof HTMLElement) || !(lastSession instanceof HTMLElement)) {
      throw new Error("analysis fixture is incomplete");
    }

    body.scrollTop = body.scrollHeight;
    sessionList.scrollTop = sessionList.scrollHeight;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const bodyRect = body.getBoundingClientRect();
    const sessionRect = sessionList.getBoundingClientRect();
    const lastBodyRect = lastBodyCard.getBoundingClientRect();
    const lastSessionRect = lastSession.getBoundingClientRect();

    return {
      body: {
        clientHeight: body.clientHeight,
        overflowY: getComputedStyle(body).overflowY,
        scrollHeight: body.scrollHeight,
        scrollTop: body.scrollTop,
        lastVisible: lastBodyRect.bottom <= bodyRect.bottom + 1
      },
      sessions: {
        clientHeight: sessionList.clientHeight,
        scrollHeight: sessionList.scrollHeight,
        scrollTop: sessionList.scrollTop,
        lastVisible: lastSessionRect.bottom <= sessionRect.bottom + 1
      }
    };
  });
}
