import test from "node:test";
import assert from "node:assert/strict";

import { createSkillsChatInstance } from "../../src/renderer/components/skillsChatSession";

test("createSkillsChatInstance builds a scoped Codex Linux session", () => {
  const instance = createSkillsChatInstance("codex", "host", "linux", { mode: "default", text: "" });

  assert.equal(instance.workspaceId, "skills-chat-codex");
  assert.equal(instance.title, "Codex Chat");
  assert.equal(instance.terminalProfileSnapshot.target, "linux");
  assert.equal(instance.terminalProfileSnapshot.shellOrProgram, "/bin/bash");
  assert.equal(instance.terminalProfileSnapshot.cwd, "~");
  assert.equal(instance.terminalProfileSnapshot.startupPresetId, "codex");
  assert.equal(instance.terminalProfileSnapshot.startupCommand, "codex");
});

test("createSkillsChatInstance builds a scoped Claude Windows host session", () => {
  const instance = createSkillsChatInstance("claude", "host", "win32", { mode: "default", text: "" });

  assert.equal(instance.workspaceId, "skills-chat-claude");
  assert.equal(instance.title, "Claude Chat");
  assert.equal(instance.terminalProfileSnapshot.target, "windows");
  assert.equal(instance.terminalProfileSnapshot.shellOrProgram, "powershell.exe");
  assert.equal(instance.terminalProfileSnapshot.cwd, "~");
  assert.equal(instance.terminalProfileSnapshot.startupPresetId, "claude");
  assert.equal(instance.terminalProfileSnapshot.startupCommand, "claude");
});

test("createSkillsChatInstance builds a scoped Codex WSL session on Windows", () => {
  const instance = createSkillsChatInstance("codex", "wsl", "win32", { mode: "default", text: "" });

  assert.equal(instance.workspaceId, "skills-chat-codex");
  assert.equal(instance.title, "Codex Chat");
  assert.equal(instance.terminalProfileSnapshot.target, "wsl");
  assert.equal(instance.terminalProfileSnapshot.shellOrProgram, "/bin/bash");
  assert.equal(instance.terminalProfileSnapshot.cwd, "~");
  assert.equal(instance.terminalProfileSnapshot.startupPresetId, "codex");
  assert.equal(instance.terminalProfileSnapshot.startupCommand, "codex");
});

test("createSkillsChatInstance switches to custom startup when a prompt is configured", () => {
  const instance = createSkillsChatInstance("claude", "host", "linux", {
    mode: "custom",
    text: "Focus on config diffs."
  });

  assert.equal(instance.terminalProfileSnapshot.startupMode, "custom");
  assert.equal(instance.terminalProfileSnapshot.startupPresetId, undefined);
  assert.match(instance.terminalProfileSnapshot.startupCommand, /--append-system-prompt/);
});
