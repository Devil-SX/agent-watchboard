import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../../src/renderer/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../src/renderer/styles.css", import.meta.url), "utf8");

test("main navigation uses icon-first tabs with tooltip labels", () => {
  assert.match(appSource, /label: "Terminal", icon: TerminalNavIcon/);
  assert.match(appSource, /label: "Skills", icon: SkillsNavIcon/);
  assert.match(appSource, /label: "Agent Config", icon: ConfigNavIcon/);
  assert.match(appSource, /label: "Analysis", icon: AnalysisNavIcon/);
  assert.match(appSource, /label: "Settings", icon: SettingsNavIcon/);
  assert.match(appSource, /data-tooltip=\{tab\.label\}/);
  assert.match(appSource, /className="content-tab-icon"/);
  assert.match(appSource, /className="sr-only"/);
});

test("main navigation tooltip and icon shell stay enabled in styles", () => {
  assert.match(styles, /\.content-tab-button::after\s*\{[^}]*content:\s*attr\(data-tooltip\);[^}]*left:\s*calc\(100% \+ 10px\);[^}]*opacity:\s*0;/s);
  assert.match(styles, /\.content-tab-button:hover::after,\s*\.content-tab-button:focus-visible::after\s*\{[^}]*opacity:\s*1;/s);
  assert.match(styles, /\.content-tab-icon\s*\{[^}]*display:\s*inline-flex;[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
  assert.match(styles, /\.content-tabs-shell\s*\{[^}]*grid-template-columns:\s*86px minmax\(0,\s*1fr\);/s);
  assert.match(styles, /\.content-tab-button\.is-active\s*\{[^}]*background:\s*linear-gradient/s);
});
