import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { quotePosixShellArgument } from "../../src/shared/posixShell";
import { buildWslLaunchCommand, buildWslStartupCommand } from "../../src/main/wslTerminalLaunch";

const execFile = promisify(execFileCallback);
const WINDOWS_POWERSHELL = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

test("buildWslStartupCommand guards fallback on a quoted status value", () => {
  const command = buildWslStartupCommand("/bin/bash", "printf 'ok\\n'");

  assert.match(command, /\[ "\$\{status:-\}" != "0" \]/);
  assert.match(command, /"\$\{status:-unknown\}"/);
  assert.doesNotMatch(command, /\[ \$status -ne 0 \]/);
});

test("buildWslStartupCommand preserves mixed-quote payloads when the shell fragment is already quoted", async () => {
  const prompt = `say "a'b" and continue with {"mode":"strict"}`;
  const startupCommand = `printf '%s\\n' ${quotePosixShellArgument(prompt)}`;
  const command = buildWslStartupCommand("/bin/bash", startupCommand);

  const result = await execFile("/bin/bash", ["-lc", command], {
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 1024 * 1024
  });

  assert.equal(result.stdout.trim(), prompt);
});

test(
  "Windows PowerShell can invoke the packaged WSL terminal launch pipeline and produce visible content",
  {
    skip: !existsSync(WINDOWS_POWERSHELL)
  },
  async () => {
    const visibleToken = "WATCHBOARD_TERMINAL_VISIBLE";
    const launchCommand = buildWslLaunchCommand("~", "/bin/bash", `printf '${visibleToken}\\n'`);
    const escapedLaunchCommand = launchCommand.replaceAll("'", "''");
    const command = `& wsl.exe -- /bin/bash -ilc '${escapedLaunchCommand}'`;

    const result = await execFile(WINDOWS_POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", command], {
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 1024 * 1024
    });

    assert.match(result.stdout, new RegExp(visibleToken));
    assert.doesNotMatch(result.stdout, /\/home\/|\\\\Users\\\\|[A-Z]:\\\\Users\\\\/i);
  }
);
