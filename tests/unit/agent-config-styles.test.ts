import test from "node:test";
import assert from "node:assert/strict";
import { loadCssBundleText } from "./helpers/loadCssBundleText";

const styles = loadCssBundleText(new URL("../../src/renderer/styles.css", import.meta.url));

test("agent config panel preserves a full-height chain for layer editors", () => {
  assert.match(
    styles,
    /\.single-view-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*height:\s*100%;[^}]*min-height:\s*0;/s
  );
  assert.match(
    styles,
    /\.agent-config-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex:\s*1;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s
  );
  assert.match(
    styles,
    /\.agent-config-main\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex:\s*1;[^}]*min-height:\s*0;/s
  );
  assert.match(
    styles,
    /\.agent-config-layer-content\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s
  );
  assert.match(
    styles,
    /\.layer-editor\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s
  );
});

test("agent config styles expose a clearly active sort preset state", () => {
  assert.match(
    styles,
    /\.layer-sort-chip\.is-active\s*\{[^}]*border-color:\s*rgba\(142,\s*199,\s*255,\s*0\.44\);[^}]*background:\s*rgba\(142,\s*199,\s*255,\s*0\.16\);/s
  );
  assert.match(
    styles,
    /\.layer-list-item\.is-disabled\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.02\);/s
  );
});

test("agent config chrome stays compact above the editor surface", () => {
  assert.match(
    styles,
    /\.agent-config-toolbar\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow:\s*auto hidden;/s
  );
  assert.match(
    styles,
    /\.agent-config-toolbar \.compact-control-button\s*\{[^}]*min-height:\s*30px;[^}]*padding:\s*0\.16rem 0\.42rem;/s
  );
  assert.match(
    styles,
    /\.agent-config-tabs\s*\{[^}]*padding-bottom:\s*6px;/s
  );
  assert.match(
    styles,
    /\.agent-config-layer-view-tabs\s*\{[^}]*padding-bottom:\s*4px;/s
  );
});

test("agent config readonly previews expose scrollable selectable surfaces", () => {
  assert.match(
    styles,
    /\.agent-config-readonly\s*\{[^}]*overflow:\s*auto;[^}]*scrollbar-gutter:\s*stable both-edges;[^}]*user-select:\s*text;[^}]*cursor:\s*text;/s
  );
  assert.match(
    styles,
    /\.merged-preview-surface\s*\{[^}]*overflow:\s*hidden;/s
  );
  assert.match(
    styles,
    /\.agent-config-readonly::-webkit-scrollbar,\s*\.skills-list::-webkit-scrollbar/s
  );
});
