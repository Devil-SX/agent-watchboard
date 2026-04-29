import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCssBundleText } from "./helpers/loadCssBundleText";

const appSource = readFileSync(new URL("../../src/renderer/App.tsx", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../../src/renderer/components/MainNavigationRail.tsx", import.meta.url), "utf8");
const styles = loadCssBundleText(new URL("../../src/renderer/styles.css", import.meta.url));

test("main navigation uses icon-first tabs with tooltip labels", () => {
  assert.match(appSource, /MainNavigationRail/);
  assert.match(navigationSource, /label: "Terminal", icon: TerminalNavIcon/);
  assert.match(navigationSource, /label: "Skills", icon: SkillsNavIcon/);
  assert.match(navigationSource, /label: "Agent Config", icon: ConfigNavIcon/);
  assert.match(navigationSource, /label: "Analysis", icon: AnalysisNavIcon/);
  assert.match(navigationSource, /label: "Settings", icon: SettingsNavIcon/);
  assert.match(navigationSource, /data-tooltip=\{tab\.label\}/);
  assert.match(navigationSource, /className="content-tab-icon"/);
  assert.match(navigationSource, /className="sr-only"/);
});

test("main navigation tooltip and icon shell stay enabled in styles", () => {
  assert.match(styles, /--shell-rail-width:\s*86px;/);
  assert.match(styles, /\.content-tab-button::after\s*\{[^}]*content:\s*attr\(data-tooltip\);[^}]*left:\s*calc\(100% \+ 10px\);[^}]*opacity:\s*0;/s);
  assert.match(styles, /\.content-tab-button:hover::after,\s*\.content-tab-button:focus-visible::after\s*\{[^}]*opacity:\s*1;/s);
  assert.match(styles, /\.content-tab-icon\s*\{[^}]*display:\s*inline-flex;[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
  assert.match(styles, /\.content-tabs-shell\s*\{[^}]*grid-template-columns:\s*var\(--shell-rail-width\) minmax\(0,\s*1fr\);/s);
  assert.match(styles, /\.content-tab-button\.is-active\s*\{[^}]*background:\s*linear-gradient/s);
});
