import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildCompletionContext, completeTerminalPath } from "../../src/main/pathCompletion";

test("completeTerminalPath suggests directories from the current segment prefix on host-posix paths", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "watchboard-path-complete-"));
  await mkdir(path.join(rootDir, "a"));
  await mkdir(path.join(rootDir, "a", "bc"));

  const result = await completeTerminalPath({
    query: `${rootDir}/a/b`,
    target: "linux"
  });

  assert.deepEqual(result.suggestions, [`${rootDir}/a/bc/`]);
  assert.equal(result.exists, false);
  assert.equal(result.isDirectory, false);
});

test("buildCompletionContext keeps prefix matching on Windows-style inputs", () => {
  const context = buildCompletionContext("a\\b", "C:\\Users\\tester\\a\\b", path.win32);

  assert.equal(context.parentResolved, "C:\\Users\\tester\\a");
  assert.equal(context.parentDisplay, "a");
  assert.equal(context.prefix, "b");
});

test("buildCompletionContext preserves trailing-directory browsing on posix inputs", () => {
  const context = buildCompletionContext("~/a/", "/home/tester/a", path.posix);

  assert.equal(context.parentResolved, "/home/tester/a");
  assert.equal(context.parentDisplay, "~/a/");
  assert.equal(context.prefix, "");
});
