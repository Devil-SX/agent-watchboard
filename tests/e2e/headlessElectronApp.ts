import { _electron, type ElectronApplication } from "@playwright/test";

import { execFileSync } from "node:child_process";
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
  const electronProcess = app.process();

  try {
    await withTimeout(app.close(), ELECTRON_E2E_CLOSE_TIMEOUT_MS);
    await waitForProcessExit(electronProcess, 1_000);
    forceKillDescendantProcesses(electronProcess.pid);
    return;
  } catch {
    // Fall through to progressively stronger shutdown paths.
  }

  try {
    await withTimeout(app.context().close(), ELECTRON_E2E_CLOSE_TIMEOUT_MS);
    await waitForProcessExit(electronProcess, 1_000);
  } catch {
    // Ignore already-closed contexts and keep escalating.
  }

  if (electronProcess.exitCode !== null || electronProcess.signalCode !== null || electronProcess.killed) {
    return;
  }

  try {
    await withTimeout(
      app.evaluate(({ app: electronApp }) => {
        electronApp.exit(0);
      }),
      ELECTRON_E2E_CLOSE_TIMEOUT_MS
    );
  } catch {
    // Ignore transport errors if the app exits before the RPC settles.
  }

  await waitForProcessExit(electronProcess, 1_000);
  if (electronProcess.exitCode !== null || electronProcess.signalCode !== null || electronProcess.killed) {
    forceKillDescendantProcesses(electronProcess.pid);
    return;
  }

  forceKillProcessTree(electronProcess);
  await waitForProcessExit(electronProcess, 1_000);
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

function forceKillProcessTree(process: ReturnType<ElectronApplication["process"]>): void {
  forceKillDescendantProcesses(process.pid);

  if (process.killed) {
    return;
  }
  try {
    process.kill("SIGKILL");
  } catch {
    // Ignore already-exited races.
  }
}

function forceKillDescendantProcesses(parentPid: number | undefined): void {
  if (!parentPid) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(parentPid), "/T", "/F"], {
        stdio: "ignore"
      });
    } catch {
      // Ignore already-exited races.
    }
    return;
  }

  for (const childPid of listDescendantPids(parentPid)) {
    try {
      process.kill(childPid, "SIGKILL");
    } catch {
      // Ignore already-exited races.
    }
  }
}

function listDescendantPids(parentPid: number): number[] {
  const descendants = new Set<number>();
  const pending = [parentPid];

  while (pending.length > 0) {
    const pid = pending.pop();
    if (pid === undefined) {
      continue;
    }

    for (const childPid of listImmediateChildPids(pid)) {
      if (descendants.has(childPid)) {
        continue;
      }
      descendants.add(childPid);
      pending.push(childPid);
    }
  }

  return [...descendants].reverse();
}

function listImmediateChildPids(parentPid: number): number[] {
  try {
    const output = execFileSync("ps", ["-o", "pid=", "--ppid", String(parentPid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    return output
      .split("\n")
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

async function waitForProcessExit(process: ReturnType<ElectronApplication["process"]>, timeoutMs: number): Promise<void> {
  if (process.exitCode !== null || process.signalCode !== null || process.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      process.removeListener("exit", handleExit);
      resolve();
    }, timeoutMs);

    const handleExit = (): void => {
      clearTimeout(timeoutId);
      resolve();
    };

    process.once("exit", handleExit);
  });
}
