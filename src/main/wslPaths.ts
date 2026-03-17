import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
let cachedDefaultWslDistro: string | null = null;
const cachedWslHomes = new Map<string, string>();

export async function resolveWslDistro(preferred?: string): Promise<string> {
  if (preferred) {
    return preferred;
  }
  if (cachedDefaultWslDistro) {
    return cachedDefaultWslDistro;
  }
  const { stdout } = await execFileAsync("wsl.exe", ["-l", "-v"], {
    windowsHide: true,
    encoding: "utf16le",
    timeout: 5000
  });
  const normalized = stdout.replaceAll("\u0000", "");
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^NAME\b/i.test(line));
  const starred = lines.find((line) => line.startsWith("*"));
  const candidate = starred ?? lines[0] ?? "";
  const distro = candidate.replace(/^\*\s*/, "").split(/\s{2,}/)[0]?.trim();
  if (!distro) {
    throw new Error("Unable to resolve default WSL distro");
  }
  cachedDefaultWslDistro = distro;
  return distro;
}

export async function resolveWslHome(distro?: string): Promise<string> {
  const cacheKey = distro ?? "__default__";
  const cached = cachedWslHomes.get(cacheKey);
  if (cached) {
    return cached;
  }
  const distroArgs = distro ? ["-d", distro] : [];
  const { stdout } = await execFileAsync(
    "wsl.exe",
    [...distroArgs, "--", "sh", "-c", 'printf %s "$HOME"'],
    {
      windowsHide: true,
      timeout: 5000
    }
  );
  const home = stdout.trim();
  if (!home.startsWith("/")) {
    throw new Error(`Unable to resolve WSL HOME${distro ? ` for distro ${distro}` : ""}`);
  }
  cachedWslHomes.set(cacheKey, home);
  return home;
}
