import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ElectronApplication, Locator, Page } from "@playwright/test";

import { closeHeadlessElectronTestApp, launchHeadlessElectronTestApp } from "./headlessElectronApp";

let app: ElectronApplication | undefined;
let page: Page | undefined;
let testHomeDir = "";

void run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function run(): Promise<void> {
  try {
    testHomeDir = mkdtempSync(path.join(tmpdir(), "watchboard-e2e-home-"));
    writeSkillFixture(testHomeDir, "base-skill", "Base skill", "Base skill used to seed the list");
    app = await launchHeadlessElectronTestApp({
      env: {
        HOME: testHomeDir
      }
    });
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await waitForAppReady(page);

    await step("app window opens and renders main layout", async () => {
      await ensureVisible(page.locator(".workspace-sidebar"), "workspace sidebar should be visible");
      await ensureVisible(page.locator(".center-panel"), "center panel should be visible");
    });

    await step("workspace sidebar has webkit scrollbar styling", async () => {
      const container = page.locator(".workspace-list");
      await ensureVisible(container, "workspace list should be visible");

      const overflowY = await container.evaluate((el) => {
        const style = getComputedStyle(el);
        return style.overflowY;
      });
      assert.ok(["overlay", "auto"].includes(overflowY), `expected overflowY to be overlay/auto, got ${overflowY}`);

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
            // Ignore inaccessible stylesheets.
          }
        }
        return null;
      });
      assert.equal(declaredOverflow, "overlay");
    });

    await step("scrollbar thumb is transparent by default", async () => {
      const container = page.locator(".workspace-list");
      await container.evaluate((el) => {
        const filler = document.createElement("div");
        filler.id = "test-filler";
        filler.style.height = "10000px";
        el.appendChild(filler);
      });
      await page.waitForTimeout(200);

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
            // Ignore inaccessible stylesheets.
          }
        }
        return null;
      });
      assert.notEqual(thumbBg, null);
      assert.ok((thumbBg ?? "").includes("transparent"), `expected transparent scrollbar thumb, got ${thumbBg}`);

      await container.evaluate((el) => {
        el.querySelector("#test-filler")?.remove();
      });
    });

    await step("main navigation tabs are present", async () => {
      const nav = page.locator("nav");
      await ensureVisible(nav, "main navigation should be visible");
      await ensureVisible(nav.locator("button", { hasText: "terminal" }), "terminal tab should be visible");
      await ensureVisible(nav.locator("button", { hasText: "skills" }), "skills tab should be visible");
      await ensureVisible(nav.locator("button", { hasText: "config" }), "config tab should be visible");
      await ensureVisible(nav.locator("button", { hasText: "analysis" }), "analysis tab should be visible");
      await ensureVisible(nav.locator("button", { hasText: "settings" }), "settings tab should be visible");
    });

    await step("can switch to skills tab", async () => {
      await clickMainNav(page, "skills");
      await ensureVisible(page.locator(".skills-panel"), "skills panel should be visible");
    });

    await step("can switch to config tab", async () => {
      await clickMainNav(page, "config");
      await ensureVisible(page.getByText("Agent Config", { exact: true }), "agent config heading should be visible");
      await ensureVisible(page.getByRole("button", { name: "Codex Config", exact: true }), "codex config tab should be visible");
    });

    await step("can switch to analysis tab and see guidance", async () => {
      await clickMainNav(page, "analysis");
      await ensureVisible(page.locator(".analysis-panel"), "analysis panel should be visible");
      await ensureVisible(page.getByText("Profiler database not found"), "analysis empty-state should be visible");
      await ensureVisible(
        page.getByText(/Install agent-trajectory-profiler to generate .*profiler\.db/i),
        "analysis install guidance should be visible"
      );
    });

    await step("can switch back to terminal tab", async () => {
      await clickMainNav(page, "terminal");
      await ensureVisible(page.locator(".workspace-sidebar"), "workspace sidebar should be visible");
      await ensureVisible(page.locator(".center-panel"), "center panel should be visible");
    });

    await step("settings categories switch content from the left sidebar", async () => {
      await clickMainNav(page, "settings");
      await ensureVisible(page.locator(".settings-panel"), "settings panel should be visible");
      await ensureVisible(page.getByText("Global Settings"), "settings title should be visible");

      const sidebar = page.getByRole("tablist", { name: "Settings categories" });
      await ensureVisible(sidebar, "settings categories should be visible");
      await ensureVisible(page.getByRole("tab", { name: /^Board\b/ }), "board settings tab should be visible");
      await ensureVisible(page.getByRole("tab", { name: /^Environments\b/ }), "environment settings tab should be visible");
      await ensureVisible(page.getByRole("tab", { name: /^Debug\b/ }), "debug settings tab should be visible");

      const heading = page.getByRole("heading", { level: 2 });
      await page.getByRole("tab", { name: /^Board\b/ }).click();
      await waitForText(heading, "Shared Board");

      await page.getByRole("tab", { name: /^Environments\b/ }).click();
      await waitForText(heading, "Environment Management");
      await ensureVisible(page.getByText("SSH Environments", { exact: true }), "ssh environments section should be visible");

      await page.getByRole("tab", { name: /^Debug\b/ }).click();
      await waitForText(heading, "Debug Paths");
    });

    await step("skills pane refresh discovers new entries", async () => {
      await clickMainNav(page, "skills");
      await ensureVisible(page.locator(".skills-panel"), "skills panel should be visible");
      await waitForText(page.locator(".skills-list"), "Base skill");

      const refreshButton = page.locator(".skills-panel-toolbar .secondary-button");
      await ensureVisible(refreshButton, "skills refresh button should be visible");
      assert.equal(await refreshButton.isEnabled(), true);

      writeSkillFixture(testHomeDir, "issue-created-skill", "Issue-created skill", "Added after app launch");
      await refreshButton.click();
      await waitForText(page.locator(".skills-list"), "Issue-created skill");
    });

    await step("analysis pane keeps the body and session list scrollable inside the single-view shell", async () => {
      await clickMainNav(page, "analysis");
      await ensureVisible(page.locator(".single-view-panel"), "analysis single-view panel should be visible");
      await injectAnalysisScrollFixture(page);

      const metrics = await measureAnalysisFixture(page);
      assert.equal(metrics.body.overflowY, "auto");
      assert.ok(
        metrics.body.scrollHeight > metrics.body.clientHeight,
        `expected body scrollHeight > clientHeight, got ${metrics.body.scrollHeight} vs ${metrics.body.clientHeight}`
      );
      assert.ok(metrics.body.scrollTop > 0, `expected body scrollTop > 0, got ${metrics.body.scrollTop}`);
      assert.equal(metrics.body.lastVisible, true, "expected last analysis card to become visible after scrolling");
      assert.ok(
        metrics.sessions.scrollHeight > metrics.sessions.clientHeight,
        `expected session list scrollHeight > clientHeight, got ${metrics.sessions.scrollHeight} vs ${metrics.sessions.clientHeight}`
      );
      assert.ok(metrics.sessions.scrollTop > 0, `expected session list scrollTop > 0, got ${metrics.sessions.scrollTop}`);
      assert.equal(metrics.sessions.lastVisible, true, "expected last session item to become visible after scrolling");
    });
  } finally {
    await closeHeadlessElectronTestApp(app);
    if (testHomeDir) {
      rmSync(testHomeDir, { recursive: true, force: true });
      testHomeDir = "";
    }
  }
}

async function waitForAppReady(page: Page): Promise<void> {
  await ensureVisible(page.getByRole("navigation", { name: "Main sections" }), "main sections navigation should be visible");
  await clickMainNav(page, "terminal");
  await ensureVisible(page.locator(".workspace-sidebar"), "workspace sidebar should be visible");
  await ensureVisible(page.locator(".center-panel"), "center panel should be visible");
}

async function clickMainNav(page: Page, name: string): Promise<void> {
  await page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
}

async function ensureVisible(locator: Locator, label: string): Promise<void> {
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await locator.isVisible(), true, label);
}

async function waitForText(locator: Locator, expectedText: string): Promise<void> {
  await locator.waitFor({ state: "visible", timeout: 10_000 });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const text = (await locator.textContent()) ?? "";
    if (text.includes(expectedText)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const text = (await locator.textContent()) ?? "";
  assert.ok(text.includes(expectedText), `expected "${expectedText}" in:\n${text}`);
}

async function step(name: string, callback: () => Promise<void>): Promise<void> {
  console.log(name);
  await callback();
}

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
