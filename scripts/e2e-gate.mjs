import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const isCiMode = args.includes("--ci");

if (!isCiMode) {
  console.error("pnpm test:e2e is CI-only and is blocked on local machines.");
  console.error("Use GitHub Actions for gated E2E, or run Playwright directly only when you intentionally want a local Electron test process.");
  process.exit(1);
}

if (process.env.CI !== "1" && process.env.CI !== "true") {
  console.error("pnpm test:e2e:ci requires CI=1 (or CI=true). Refusing to start Electron E2E outside CI.");
  process.exit(1);
}

// GitHub runners have been intermittently hanging in @playwright/test worker teardown
// after all Electron assertions have already passed. CI uses a direct Playwright Electron
// script so the gate still exercises the real app without depending on the flaky worker lifecycle.
const child = spawn("pnpm", ["exec", "tsx", "tests/e2e/scrollbar-overlay.ci.ts"], {
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
