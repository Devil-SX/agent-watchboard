import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { resolveWslDistro, resolveWslHome } from "@main/wslPaths";
import type { DoctorAgent, DoctorCheckResult, DoctorLocation } from "@shared/schema";

const DOCTOR_PROMPT = "Reply exactly with OK";

export type DoctorRunSpec = {
  command: string;
  args: string[];
  cwd: string;
  commandSummary: string;
  tempOutputPath?: string;
};

export function getDoctorTargetKey(location: DoctorLocation, agent: DoctorAgent): string {
  return `${location}:${agent}`;
}

export async function buildDoctorRunSpec(
  location: DoctorLocation,
  agent: DoctorAgent,
  options: {
    platform: NodeJS.Platform;
    hostHome: string;
    appDataDir: string;
  }
): Promise<DoctorRunSpec> {
  const doctorDir = join(options.appDataDir, "doctor");
  mkdirSync(doctorDir, { recursive: true });

  if (location === "host") {
    if (agent === "codex") {
      const tempOutputPath = join(doctorDir, `codex-last-message-${randomUUID()}.txt`);
      return {
        command: "codex",
        args: [
          "exec",
          "--skip-git-repo-check",
          "--sandbox",
          "read-only",
          "--color",
          "never",
          "--output-last-message",
          tempOutputPath,
          DOCTOR_PROMPT
        ],
        cwd: options.hostHome,
        commandSummary: `codex exec --skip-git-repo-check --sandbox read-only --color never --output-last-message <temp> ${JSON.stringify(DOCTOR_PROMPT)}`,
        tempOutputPath
      };
    }

    return {
      command: "claude",
      args: ["-p", "--output-format", "text", "--permission-mode", "bypassPermissions", DOCTOR_PROMPT],
      cwd: options.hostHome,
      commandSummary: `claude -p --output-format text --permission-mode bypassPermissions ${JSON.stringify(DOCTOR_PROMPT)}`
    };
  }

  if (options.platform !== "win32") {
    throw new Error("WSL diagnostics are only available on Windows hosts.");
  }

  const distro = await resolveWslDistro();
  const wslHome = await resolveWslHome(distro);
  const quotedPrompt = shellSingleQuote(DOCTOR_PROMPT);

  if (agent === "codex") {
    const script = [
      "set -eu",
      'tmp="$(mktemp)"',
      `cd ${shellSingleQuote(wslHome)}`,
      `codex exec --skip-git-repo-check --sandbox read-only --color never --output-last-message "$tmp" ${quotedPrompt}`,
      'status=$?',
      'printf "\\n__WATCHBOARD_LAST_MESSAGE_BEGIN__\\n"',
      'cat "$tmp" 2>/dev/null || true',
      'printf "\\n__WATCHBOARD_LAST_MESSAGE_END__\\n"',
      'rm -f "$tmp"',
      "exit $status"
    ].join("; ");
    return {
      command: "wsl.exe",
      args: ["-d", distro, "bash", "-lc", script],
      cwd: options.hostHome,
      commandSummary: `wsl.exe -d ${distro} bash -lc "codex exec --skip-git-repo-check --sandbox read-only --color never --output-last-message <tmp> ${DOCTOR_PROMPT}"`,
    };
  }

  return {
    command: "wsl.exe",
    args: ["-d", distro, "bash", "-lc", `cd ${shellSingleQuote(wslHome)} && claude -p --output-format text --permission-mode bypassPermissions ${quotedPrompt}`],
    cwd: options.hostHome,
    commandSummary: `wsl.exe -d ${distro} bash -lc "claude -p --output-format text --permission-mode bypassPermissions ${DOCTOR_PROMPT}"`
  };
}

export async function runDoctorCheck(
  location: DoctorLocation,
  agent: DoctorAgent,
  options: {
    platform: NodeJS.Platform;
    hostHome: string;
    appDataDir: string;
  }
): Promise<DoctorCheckResult> {
  const startedAt = new Date();
  const spec = await buildDoctorRunSpec(location, agent, options);
  const result = await spawnAndCollect(spec.command, spec.args, spec.cwd);
  const finishedAt = new Date();
  let lastMessage = "";
  if (agent === "codex") {
    lastMessage = extractCodexLastMessage(result.stdout);
    if (!lastMessage && spec.tempOutputPath && existsSync(spec.tempOutputPath)) {
      try {
        lastMessage = readFileSync(spec.tempOutputPath, "utf8").trim();
      } catch {
        // ignore
      }
    }
    if (spec.tempOutputPath) {
      rmSync(spec.tempOutputPath, { force: true });
    }
  } else {
    lastMessage = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? "";
  }

  return {
    key: getDoctorTargetKey(location, agent),
    agent,
    location,
    status: result.exitCode === 0 ? "success" : "error",
    commandSummary: spec.commandSummary,
    cwd: spec.cwd,
    stdout: sanitizeCodexStdout(result.stdout),
    stderr: result.stderr,
    lastMessage,
    exitCode: result.exitCode,
    errorMessage: result.errorMessage,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime()
  };
}

function spawnAndCollect(command: string, args: string[], cwd: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  errorMessage: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      finish({
        stdout,
        stderr,
        exitCode: null,
        errorMessage: "Doctor check timed out after 30 seconds."
      });
    }, 30_000);

    const finish = (payload: { stdout: string; stderr: string; exitCode: number | null; errorMessage: string }): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(payload);
    };

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      finish({
        stdout,
        stderr,
        exitCode: null,
        errorMessage: error.message
      });
    });
    child.on("close", (exitCode) => {
      finish({
        stdout,
        stderr,
        exitCode,
        errorMessage: ""
      });
    });
  });
}

function extractCodexLastMessage(stdout: string): string {
  const begin = "__WATCHBOARD_LAST_MESSAGE_BEGIN__";
  const end = "__WATCHBOARD_LAST_MESSAGE_END__";
  const startIndex = stdout.indexOf(begin);
  const endIndex = stdout.indexOf(end);
  if (startIndex >= 0 && endIndex > startIndex) {
    return stdout.slice(startIndex + begin.length, endIndex).trim();
  }
  return "";
}

function sanitizeCodexStdout(stdout: string): string {
  return stdout
    .replace(/\n__WATCHBOARD_LAST_MESSAGE_BEGIN__[\s\S]*?__WATCHBOARD_LAST_MESSAGE_END__\n?/g, "\n")
    .trim();
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
