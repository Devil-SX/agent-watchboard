import { existsSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const executablePath = join(root, "release", "win-unpacked", "Agent Watchboard.exe");
const appAsarPath = join(root, "release", "win-unpacked", "resources", "app.asar");
const buildStartedAt = Date.now();

runOrThrow("pnpm", ["build"]);
removeStaleWindowsOutput();

const builder = spawnSync("pnpm", ["exec", "electron-builder", "--win", "dir"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32"
});

if ((builder.status ?? 1) === 0) {
  process.exit(0);
}

if (hasFreshWindowsOutput()) {
  process.stderr.write(
    `[watchboard] electron-builder reported a Windows packaging warning on this host, but the unpacked executable exists at ${executablePath}\n`
  );
  process.exit(0);
}

process.exit(builder.status ?? 1);

function runOrThrow(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function removeStaleWindowsOutput() {
  rmSync(join(root, "release", "win-unpacked"), { recursive: true, force: true });
}

function hasFreshWindowsOutput() {
  if (!existsSync(executablePath) || !existsSync(appAsarPath)) {
    return false;
  }

  return statSync(executablePath).mtimeMs >= buildStartedAt && statSync(appAsarPath).mtimeMs >= buildStartedAt;
}
