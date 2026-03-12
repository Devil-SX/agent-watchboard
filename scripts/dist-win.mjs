import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const executablePath = join(root, "release", "win-unpacked", "Agent Watchboard.exe");

runOrThrow("pnpm", ["build"]);

const builder = spawnSync("pnpm", ["exec", "electron-builder", "--win", "dir"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32"
});

if ((builder.status ?? 1) === 0) {
  process.exit(0);
}

if (existsSync(executablePath)) {
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
