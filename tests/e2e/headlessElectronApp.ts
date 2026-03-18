import { _electron, type ElectronApplication } from "@playwright/test";

import path from "node:path";

import { WATCHBOARD_DISABLE_GPU_ARG, WATCHBOARD_HEADLESS_TEST_ARG } from "../../src/main/headlessTestMode";

const ELECTRON_E2E_CLOSE_TIMEOUT_MS = 5_000;

export const HEADLESS_ELECTRON_TEST_ARGS = [
  path.resolve("out/main/index.js"),
  WATCHBOARD_HEADLESS_TEST_ARG,
  WATCHBOARD_DISABLE_GPU_ARG,
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--use-gl=disabled",
  "--disable-dev-shm-usage"
];

export function createHeadlessElectronTestEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    WATCHBOARD_DISABLE_GPU: "1",
    WATCHBOARD_HEADLESS_TEST: "1",
    ...overrides
  };
}

export async function launchHeadlessElectronTestApp(overrides: {
  args?: string[];
  env?: NodeJS.ProcessEnv;
} = {}): Promise<ElectronApplication> {
  return _electron.launch({
    args: overrides.args ?? HEADLESS_ELECTRON_TEST_ARGS,
    env: createHeadlessElectronTestEnv(overrides.env)
  });
}

export async function closeHeadlessElectronTestApp(app: ElectronApplication | undefined): Promise<void> {
  if (!app) {
    return;
  }

  try {
    await withTimeout(
      app.evaluate(async ({ app: electronApp }) => {
        await electronApp.quit();
      }),
      ELECTRON_E2E_CLOSE_TIMEOUT_MS
    );
  } catch {
    // Ignore transport errors if the app is already shutting down.
  }

  try {
    await withTimeout(app.close(), ELECTRON_E2E_CLOSE_TIMEOUT_MS);
  } catch {
    // Ignore duplicate-close races once the process is gone.
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    void promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}
