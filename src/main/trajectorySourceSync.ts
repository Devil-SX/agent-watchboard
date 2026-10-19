import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { posix } from "node:path";
import { promisify } from "node:util";
import { resolveWslDistro, resolveWslHome } from "./wslPaths";

export type SourceSyncResult = { state: "complete" | "deferred"; chunks?: number; uploadedBytes?: number };
type Launch = (file: string, args: string[]) => Promise<{ stdout: string }>;
const execute = promisify(execFile);
const launch: Launch = (file, args) => execute(file, args, {
  windowsHide: true, timeout: 45_000, maxBuffer: 16_384
});

export function sharedSourceSyncCommand(platform: NodeJS.Platform, home: string, distro?: string): {
  file: string; args: string[];
} {
  if (!home.startsWith("/") || /[\r\n\0]/.test(home)) throw new Error("Invalid source-sync home");
  const args = ["python3", posix.join(home, ".local/lib/trajectory/trajectory_source_sync.py"),
    "--config", posix.join(home, ".config/trajectory/source-sync.json"), "--max-chunks", "1"];
  if (platform === "win32") {
    if (!distro || /[\r\n\0]/.test(distro)) throw new Error("Source-sync WSL distro is required");
    return { file: "wsl.exe", args: ["--distribution", distro, "--exec", ...args] };
  }
  return { file: "python3", args: args.slice(1) };
}

/** Trigger the canonical uploader; all ownership, locking and retry state lives there. */
export class TrajectorySourceSync {
  private active: Promise<SourceSyncResult> | null = null;
  constructor(private readonly dependencies: {
    platform: NodeJS.Platform;
    home: string;
    distro: (preferred?: string) => Promise<string>;
    wslHome: (distro: string) => Promise<string>;
    launch: Launch;
  } = { platform: process.platform, home: homedir(), distro: resolveWslDistro,
    wslHome: resolveWslHome, launch }) {}

  trigger(preferredDistro?: string): Promise<SourceSyncResult> {
    // Repeated worker ticks share one in-flight request; the CLI's OS lock also
    // serializes against independent Agents and the systemd timer.
    if (this.active) return this.active;
    this.active = this.run(preferredDistro).finally(() => { this.active = null; });
    return this.active;
  }

  private async run(preferredDistro?: string): Promise<SourceSyncResult> {
    try {
      const deps = this.dependencies;
      const distro = deps.platform === "win32" ? await deps.distro(preferredDistro) : undefined;
      const home = distro ? await deps.wslHome(distro) : deps.home;
      const command = sharedSourceSyncCommand(deps.platform, home, distro);
      const { stdout } = await deps.launch(command.file, command.args);
      const result = JSON.parse(stdout.trim()) as Record<string, unknown>;
      if (!Number.isSafeInteger(result.chunks) || Number(result.chunks) < 0 ||
          !Number.isSafeInteger(result.uploaded_bytes) || Number(result.uploaded_bytes) < 0) {
        return { state: "deferred" };
      }
      return { state: "complete", chunks: Number(result.chunks), uploadedBytes: Number(result.uploaded_bytes) };
    } catch {
      // Missing install, network failure and an occupied shared lock all leave
      // the canonical outbox intact for the next trigger. Never log child stderr:
      // it could contain source paths or provider messages.
      return { state: "deferred" };
    }
  }
}
