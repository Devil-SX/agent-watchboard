import test from "node:test";
import assert from "node:assert/strict";

import { buildSkillsChatSessionKey, resolveSkillsChatLocation } from "../../src/renderer/components/skillsChatSession";

test("resolveSkillsChatLocation collapses non-Windows locations to host", () => {
  assert.equal(resolveSkillsChatLocation("wsl", "linux"), "host");
  assert.equal(resolveSkillsChatLocation("host", "linux"), "host");
  assert.equal(resolveSkillsChatLocation("wsl", "win32"), "wsl");
  assert.equal(resolveSkillsChatLocation("host", "win32"), "host");
});

test("buildSkillsChatSessionKey stays stable across tab switches and changes only when agent or effective env changes", () => {
  assert.equal(buildSkillsChatSessionKey("codex", "wsl", "win32"), buildSkillsChatSessionKey("codex", "wsl", "win32"));
  assert.notEqual(buildSkillsChatSessionKey("codex", "wsl", "win32"), buildSkillsChatSessionKey("claude", "wsl", "win32"));
  assert.notEqual(buildSkillsChatSessionKey("codex", "wsl", "win32"), buildSkillsChatSessionKey("codex", "host", "win32"));
  assert.equal(buildSkillsChatSessionKey("codex", "wsl", "linux"), buildSkillsChatSessionKey("codex", "host", "linux"));
});
