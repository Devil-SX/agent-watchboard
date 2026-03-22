import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPaneChatSessionKey,
  buildPaneChatStartupCommand,
  createPaneChatInstance,
  resolvePaneChatLocation
} from "../../src/renderer/components/paneChatSession";

test("resolvePaneChatLocation collapses non-Windows pane chats to host", () => {
  assert.equal(resolvePaneChatLocation("wsl", "linux"), "host");
  assert.equal(resolvePaneChatLocation("host", "linux"), "host");
  assert.equal(resolvePaneChatLocation("wsl", "win32"), "wsl");
});

test("buildPaneChatSessionKey separates skills and config sessions", () => {
  assert.notEqual(
    buildPaneChatSessionKey("skills", "codex", "host", "linux"),
    buildPaneChatSessionKey("config", "codex", "host", "linux")
  );
});

test("createPaneChatInstance builds a scoped config chat session", () => {
  const instance = createPaneChatInstance("config", "claude", "host", "linux", {
    mode: "default",
    text: ""
  }, true);

  assert.equal(instance.workspaceId, "config-chat-claude");
  assert.equal(instance.title, "Claude Config Chat");
  assert.equal(instance.terminalProfileSnapshot.startupMode, "preset");
  assert.equal(instance.terminalProfileSnapshot.startupPresetId, "claude-skip-permissions");
});

test("buildPaneChatStartupCommand appends Claude prompts and preserves quoting", () => {
  const command = buildPaneChatStartupCommand("claude", "linux", "/bin/bash", {
    mode: "custom",
    text: "Keep 'scope' intact."
  }, true);

  assert.equal(command, "claude --dangerously-skip-permissions --append-system-prompt 'Keep '\"'\"'scope'\"'\"' intact.'");
});

test("buildPaneChatStartupCommand maps Codex prompts to developer_instructions", () => {
  const command = buildPaneChatStartupCommand("codex", "windows", "powershell.exe", {
    mode: "custom",
    text: "Only discuss config deltas"
  }, true);

  assert.equal(command, "codex --dangerously-bypass-approvals-and-sandbox -c 'developer_instructions=Only discuss config deltas'");
});

test("buildPaneChatSessionKey changes when skip-dangerous changes", () => {
  assert.notEqual(
    buildPaneChatSessionKey("skills", "codex", "host", "linux", false),
    buildPaneChatSessionKey("skills", "codex", "host", "linux", true)
  );
});
