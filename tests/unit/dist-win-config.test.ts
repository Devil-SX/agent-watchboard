import test from "node:test";
import assert from "node:assert/strict";

import { getWindowsDirBuildArgs, isCrossPackagingHost } from "../../scripts/dist-win-config.mjs";

test("Windows hosts keep the default electron-builder args for dist:win", () => {
  assert.equal(isCrossPackagingHost("win32"), false);
  assert.deepEqual(getWindowsDirBuildArgs("win32"), ["exec", "electron-builder", "--win", "dir"]);
});

test("Non-Windows hosts disable native rebuild and executable edits for dist:win", () => {
  assert.equal(isCrossPackagingHost("linux"), true);
  assert.deepEqual(getWindowsDirBuildArgs("linux"), [
    "exec",
    "electron-builder",
    "--win",
    "dir",
    "-c.npmRebuild=false",
    "-c.win.signAndEditExecutable=false"
  ]);
});
