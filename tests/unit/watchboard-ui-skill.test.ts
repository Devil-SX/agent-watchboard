import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/watchboard-ui/SKILL.md", import.meta.url), "utf8");
const cli = readFileSync(new URL("../../skills/watchboard-ui/bin/watchboard-ui.mjs", import.meta.url), "utf8");
const install = readFileSync(new URL("../../skills/watchboard-ui/install.sh", import.meta.url), "utf8");
const uninstall = readFileSync(new URL("../../skills/watchboard-ui/uninstall.sh", import.meta.url), "utf8");

test("watchboard-ui skill documents host path requirements and non-terminal boundary", () => {
  assert.match(skill, /must be readable by the Agent Watchboard desktop app/);
  assert.match(skill, /must not be used to create, close, collapse, resize, write to, or otherwise mutate terminal panels/);
  assert.match(skill, /watchboard-ui panel image --file/);
  assert.match(skill, /watchboard-ui panel browser --url/);
});

test("watchboard-ui CLI maps commands to app control protocol methods without path conversion", () => {
  assert.match(cli, /layout\.getSnapshot/);
  assert.match(cli, /panel\.createImage/);
  assert.match(cli, /panel\.createBrowser/);
  assert.match(cli, /panel\.close/);
  assert.match(cli, /The CLI does not convert paths|host-path/);
  assert.doesNotMatch(cli, /wslpath/);
});

test("watchboard-ui installer creates owned wrapper and multi-agent symlinks", () => {
  assert.match(install, /\$HOME\/\.codex\/skills/);
  assert.match(install, /\$HOME\/\.claude\/skills/);
  assert.match(install, /\$HOME\/\.opencode\/skills/);
  assert.match(install, /Installed by watchboard-ui skill/);
  assert.match(uninstall, /readlink/);
  assert.ok((statSync(new URL("../../skills/watchboard-ui/install.sh", import.meta.url)).mode & 0o111) !== 0);
  assert.ok((statSync(new URL("../../skills/watchboard-ui/bin/watchboard-ui.mjs", import.meta.url)).mode & 0o111) !== 0);
});
