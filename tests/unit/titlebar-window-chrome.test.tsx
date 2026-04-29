import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TitleBar } from "../../src/renderer/components/TitleBar";
import { loadCssBundleText } from "./helpers/loadCssBundleText";

const mainIndexSource = readFileSync(new URL("../../src/main/index.ts", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../src/preload/index.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../src/renderer/App.tsx", import.meta.url), "utf8");
const styles = loadCssBundleText(new URL("../../src/renderer/styles.css", import.meta.url));

test("main process hides the native title bar and relays window state", () => {
  assert.match(mainIndexSource, /titleBarStyle:\s*process\.platform === "darwin" \? "hiddenInset" : "hidden"/);
  assert.match(mainIndexSource, /titleBarOverlay:\s*process\.platform === "darwin"\s*\?\s*false\s*:/);
  assert.match(mainIndexSource, /mainWindow\.webContents\.send\("window-state", resolveWindowState\(mainWindow\)\)/);
  assert.match(mainIndexSource, /ipcMain\.handle\("watchboard:get-window-state"/);
  assert.match(mainIndexSource, /ipcMain\.handle\("watchboard:toggle-maximize-window"/);
  assert.match(mainIndexSource, /ipcMain\.handle\("watchboard:close-window"/);
});

test("preload exposes custom title bar window controls", () => {
  assert.match(preloadSource, /getWindowState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("watchboard:get-window-state"\)/);
  assert.match(preloadSource, /minimizeWindow:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("watchboard:minimize-window"\)/);
  assert.match(preloadSource, /toggleMaximizeWindow:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("watchboard:toggle-maximize-window"\)/);
  assert.match(preloadSource, /closeWindow:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("watchboard:close-window"\)/);
  assert.match(preloadSource, /ipcRenderer\.on\("window-state", wrapped\)/);
});

test("App mounts the custom title bar above the main workbench shell", () => {
  assert.match(appSource, /import \{ ContentTabsShell, WindowShell \} from "@renderer\/components\/ChromeShell";/);
  assert.match(appSource, /import \{ FloatingErrorToast, type FloatingErrorNotice \} from "@renderer\/components\/FloatingErrorToast";/);
  assert.match(appSource, /<WindowShell/);
  assert.match(appSource, /<TitleBar/);
  assert.match(appSource, /<ContentTabsShell/);
  assert.match(appSource, /<FloatingErrorToast notice=\{error\} onDismiss=\{clearError\} \/>/);
});

test("TitleBar renders custom window controls on non-mac platforms", () => {
  const html = renderToStaticMarkup(
    <TitleBar activeTabLabel="Settings" workspaceName="quantization" appVersion="0.14.0" platform="win32" />
  );

  assert.match(html, /Agent Watchboard/);
  assert.match(html, /quantization · Settings/);
  assert.match(html, /v0\.14\.0/);
  assert.match(html, /aria-label="Minimize window"/);
  assert.match(html, /aria-label="Maximize window"/);
  assert.match(html, /aria-label="Close window"/);
});

test("TitleBar defers to native traffic lights on macOS", () => {
  const html = renderToStaticMarkup(
    <TitleBar activeTabLabel="Terminal" workspaceName="idea_survey" appVersion="0.14.0" platform="darwin" />
  );

  assert.match(html, /titlebar is-macos/);
  assert.match(html, /titlebar-macos-spacer/);
  assert.doesNotMatch(html, /Minimize window/);
  assert.doesNotMatch(html, /Close window/);
});

test("title bar styles preserve a dedicated drag region and no-drag controls", () => {
  assert.match(
    styles,
    /\.window-shell\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);[^}]*height:\s*100%;/s
  );
  assert.match(
    styles,
    /\.titlebar-surface\s*\{[^}]*border-bottom:\s*0;[^}]*border-radius:\s*var\(--window-shell-top-radius\) var\(--window-shell-top-radius\) 0 0;/s
  );
  assert.match(
    styles,
    /\.titlebar-drag-region\s*\{[^}]*min-height:\s*var\(--window-titlebar-height\);[^}]*-webkit-app-region:\s*drag;/s
  );
  assert.match(
    styles,
    /\.titlebar-window-controls\s*\{[^}]*overflow:\s*hidden;[^}]*-webkit-app-region:\s*no-drag;/s
  );
  assert.match(
    styles,
    /\.titlebar-control\s*\{[^}]*-webkit-app-region:\s*no-drag;/s
  );
  assert.match(
    styles,
    /\.app-shell\s*\{[^}]*padding:\s*0 var\(--window-shell-pad\) var\(--window-shell-pad\);/s
  );
  assert.match(
    styles,
    /\.app-notification-stack\s*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(var\(--window-titlebar-height\) \+ var\(--window-shell-pad\) \+ 12px\);[^}]*pointer-events:\s*none;/s
  );
  assert.match(
    styles,
    /\.app-notification-toast\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[^}]*pointer-events:\s*auto;/s
  );
});
