import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  isWatchboardHeadlessTest,
  shouldDisableGpuForWatchboard,
  WATCHBOARD_DISABLE_GPU_ARG,
  WATCHBOARD_HEADLESS_TEST_ARG
} from "../../src/main/headlessTestMode";
import { createHeadlessElectronTestEnv, HEADLESS_ELECTRON_TEST_ARGS } from "../e2e/headlessElectronApp";

test("headless electron e2e env always enables the repository headless contract", () => {
  const env = createHeadlessElectronTestEnv({ HOME: "/tmp/watchboard-e2e-home" });

  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.WATCHBOARD_DISABLE_GPU, "1");
  assert.equal(env.WATCHBOARD_HEADLESS_TEST, "1");
  assert.equal(env.HOME, "/tmp/watchboard-e2e-home");
});

test("headless electron e2e args include explicit watchboard runtime flags", () => {
  assert.ok(HEADLESS_ELECTRON_TEST_ARGS.includes(WATCHBOARD_HEADLESS_TEST_ARG));
  assert.ok(HEADLESS_ELECTRON_TEST_ARGS.includes(WATCHBOARD_DISABLE_GPU_ARG));
  assert.deepEqual(HEADLESS_ELECTRON_TEST_ARGS.slice(3), [
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--use-gl=disabled",
    "--disable-dev-shm-usage"
  ]);
});

test("main-process headless detection accepts either env vars or argv flags", () => {
  assert.equal(isWatchboardHeadlessTest(["electron", WATCHBOARD_HEADLESS_TEST_ARG], {}), true);
  assert.equal(shouldDisableGpuForWatchboard(["electron", WATCHBOARD_DISABLE_GPU_ARG], {}), true);
  assert.equal(isWatchboardHeadlessTest(["electron"], { WATCHBOARD_HEADLESS_TEST: "1" }), true);
  assert.equal(shouldDisableGpuForWatchboard(["electron"], { WATCHBOARD_DISABLE_GPU: "1" }), true);
});

test("e2e specs use the shared headless helper instead of direct _electron.launch", () => {
  const e2eDir = join(process.cwd(), "tests", "e2e");
  const specFiles = readdirSync(e2eDir).filter((file) => file.endsWith(".spec.ts"));

  for (const file of specFiles) {
    const source = readFileSync(join(e2eDir, file), "utf8");
    assert.equal(source.includes("_electron.launch("), false, `${file} must use launchHeadlessElectronTestApp`);
    assert.equal(source.includes("launchHeadlessElectronTestApp"), true, `${file} must import the shared headless helper`);
  }
});
