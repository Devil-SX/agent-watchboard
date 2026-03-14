import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openDebugPath, resolveDebugPathOpenTarget } from "../../src/main/openDebugPath";

test("resolveDebugPathOpenTarget keeps directories unchanged", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "watchboard-debug-path-"));
  const logsDir = join(rootDir, "logs");
  await mkdir(logsDir);

  assert.equal(resolveDebugPathOpenTarget(logsDir), logsDir);
});

test("resolveDebugPathOpenTarget maps files to their containing directory", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "watchboard-debug-path-"));
  const logsDir = join(rootDir, "logs");
  const logFile = join(logsDir, "main.log");
  await mkdir(logsDir);
  await writeFile(logFile, "log", "utf8");

  assert.equal(resolveDebugPathOpenTarget(logFile), logsDir);
});

test("openDebugPath opens the resolved target directory", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "watchboard-debug-path-"));
  const logsDir = join(rootDir, "logs");
  const logFile = join(logsDir, "main.log");
  await mkdir(logsDir);
  await writeFile(logFile, "log", "utf8");

  let openedPath = "";
  await openDebugPath(logFile, async (targetPath) => {
    openedPath = targetPath;
    return "";
  });

  assert.equal(openedPath, logsDir);
});

test("openDebugPath surfaces shell open failures", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "watchboard-debug-path-"));
  const logsDir = join(rootDir, "logs");
  await mkdir(logsDir);

  await assert.rejects(
    () => openDebugPath(logsDir, async () => "shell failed"),
    /Failed to open debug path/
  );
});
