import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { sanitizePathForLogs } from "../../src/main/pathRedaction";
import { parseDefaultWslDistroListing, resetWslPathCacheForTests } from "../../src/main/wslPaths";

const execFile = promisify(execFileCallback);
const WINDOWS_POWERSHELL = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

test("parseDefaultWslDistroListing tolerates UTF-16 NUL padded wsl.exe output", () => {
  resetWslPathCacheForTests();
  const raw = "N\u0000A\u0000M\u0000E\u0000 \u0000 \u0000 \u0000S\u0000T\u0000A\u0000T\u0000E\u0000\r\n*\u0000 \u0000U\u0000b\u0000u\u0000n\u0000t\u0000u\u0000 \u0000 \u0000R\u0000u\u0000n\u0000n\u0000i\u0000n\u0000g\u0000\r\n";

  assert.equal(parseDefaultWslDistroListing(raw), "Ubuntu");
});

test("sanitizePathForLogs redacts Windows and WSL home paths", () => {
  assert.equal(
    sanitizePathForLogs("C:\\Users\\tester\\.agent-vis\\profiler.db"),
    "~\\.agent-vis\\profiler.db"
  );
  assert.equal(
    sanitizePathForLogs("\\\\wsl.localhost\\Ubuntu\\home\\tester\\.agent-vis\\profiler.db"),
    "\\\\wsl.localhost\\Ubuntu\\~\\.agent-vis\\profiler.db"
  );
  assert.equal(
    sanitizePathForLogs("/home/tester/.agent-vis/profiler.db"),
    "~/.agent-vis/profiler.db"
  );
});

test(
  "Windows PowerShell can invoke the WSL distro/home probes used by analysis path resolution without exposing the user path",
  {
    skip: !existsSync(WINDOWS_POWERSHELL)
  },
  async () => {
    const distroResult = await execFile(
      WINDOWS_POWERSHELL,
      ["-NoProfile", "-NonInteractive", "-Command", "& wsl.exe -l -v"],
      {
        encoding: "utf8",
        timeout: 15_000,
        maxBuffer: 1024 * 1024
      }
    );
    const distro = parseDefaultWslDistroListing(distroResult.stdout);
    assert.equal(distro.length > 0, true);

    const homeResult = await execFile(
      WINDOWS_POWERSHELL,
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `& wsl.exe -d '${distro.replaceAll("'", "''")}' -- sh -c 'printf %s \"$HOME\"'`
      ],
      {
        encoding: "utf8",
        timeout: 15_000,
        maxBuffer: 1024 * 1024
      }
    );

    const home = homeResult.stdout.trim();
    assert.equal(home.startsWith("/"), true);
    assert.equal(home.includes("\\"), false);

    const redacted = sanitizePathForLogs(`\\\\wsl.localhost\\${distro}${home.replaceAll("/", "\\")}\\.agent-vis\\profiler.db`);
    assert.equal(redacted.includes("\\home\\"), false);
    assert.equal(/\\\\wsl(?:\.localhost|\$)\\[^\\]+\\~\\\.agent-vis\\profiler\.db/i.test(redacted), true);
  }
);
