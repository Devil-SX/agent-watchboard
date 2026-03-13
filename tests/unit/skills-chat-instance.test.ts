import test from "node:test";
import assert from "node:assert/strict";

import { createSkillsChatInstance } from "../../src/renderer/components/skillsChatSession";

test("createSkillsChatInstance builds a scoped Codex Linux session", () => {
  const instance = createSkillsChatInstance("codex", "linux");

  assert.equal(instance.workspaceId, "skills-chat-codex");
  assert.equal(instance.title, "Codex Chat");
  assert.equal(instance.terminalProfileSnapshot.target, "linux");
  assert.equal(instance.terminalProfileSnapshot.shellOrProgram, "/bin/bash");
  assert.equal(instance.terminalProfileSnapshot.cwd, "~");
  assert.equal(instance.terminalProfileSnapshot.startupPresetId, "codex");
  assert.equal(instance.terminalProfileSnapshot.startupCommand, "codex");
});

test("createSkillsChatInstance builds a scoped Claude Windows session", () => {
  const instance = createSkillsChatInstance("claude", "win32");

  assert.equal(instance.workspaceId, "skills-chat-claude");
  assert.equal(instance.title, "Claude Chat");
  assert.equal(instance.terminalProfileSnapshot.target, "windows");
  assert.equal(instance.terminalProfileSnapshot.shellOrProgram, "powershell.exe");
  assert.equal(instance.terminalProfileSnapshot.cwd, "~");
  assert.equal(instance.terminalProfileSnapshot.startupPresetId, "claude");
  assert.equal(instance.terminalProfileSnapshot.startupCommand, "claude");
});
