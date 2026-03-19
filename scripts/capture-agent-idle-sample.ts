import { tmpdir } from "node:os";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { writeFile } from "node:fs/promises";

import pty from "node-pty";

import { assessTerminalActivity } from "../src/shared/terminalActivity";

type CliOptions = {
  agent: string;
  cwd: string;
  seconds: number;
  command: string;
  args: string[];
};

type CapturedChunk = {
  index: number;
  atMs: number;
  data: string;
  assessment: ReturnType<typeof assessTerminalActivity>;
};

// Manual local tool only. This intentionally samples a real interactive agent session and writes
// the captured PTY output to /tmp so we can calibrate idle heuristics without leaking repo files.
async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replaceAll(":", "-");
  const jsonPath = join(tmpdir(), `watchboard-terminal-activity-${options.agent}-${stamp}.json`);
  const markdownPath = join(tmpdir(), `watchboard-terminal-activity-${options.agent}-${stamp}.md`);
  const startedAtMs = Date.now();
  const chunks: CapturedChunk[] = [];

  const child = pty.spawn(options.command, options.args, {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: options.cwd,
    env: { ...process.env, TERM: "xterm-256color" }
  });

  child.onData((data) => {
    const assessment = assessTerminalActivity(data);
    chunks.push({
      index: chunks.length,
      atMs: Date.now() - startedAtMs,
      data: redactHome(data),
      assessment: {
        ...assessment,
        sanitized: redactHome(assessment.sanitized),
        normalized: redactHome(assessment.normalized)
      }
    });
  });

  const exit = await new Promise<{ exitCode: number; signal: number }>((resolve) => {
    let settled = false;
    child.onExit((event) => {
      settled = true;
      resolve(event);
    });
    setTimeout(() => {
      if (!settled) {
        child.kill();
      }
    }, options.seconds * 1000).unref();
  });

  const payload = {
    agent: options.agent,
    command: options.command,
    args: options.args,
    cwd: redactHome(options.cwd),
    durationSeconds: options.seconds,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    exit,
    chunkCount: chunks.length,
    chunks
  };
  await writeFile(jsonPath, JSON.stringify(payload, null, 2));
  await writeFile(markdownPath, renderMarkdownSummary(payload));

  console.log(`Captured ${chunks.length} chunks to ${jsonPath}`);
  console.log(`Summary written to ${markdownPath}`);
}

function parseCliOptions(argv: string[]): CliOptions {
  let cwd = homedir();
  let agent = "codex";
  let command = "codex";
  let seconds = 20;
  const args: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--agent") {
      agent = argv[index + 1] ?? agent;
      command = agent;
      index += 1;
      continue;
    }
    if (current === "--seconds") {
      seconds = Number(argv[index + 1] ?? seconds);
      index += 1;
      continue;
    }
    if (current === "--cwd") {
      const nextCwd = argv[index + 1];
      if (nextCwd) {
        cwd = nextCwd;
      }
      index += 1;
      continue;
    }
    if (current === "--command") {
      command = argv[index + 1] ?? command;
      index += 1;
      continue;
    }
    if (current === "--arg") {
      const nextArg = argv[index + 1];
      if (nextArg) {
        args.push(nextArg);
      }
      index += 1;
    }
  }

  return {
    agent,
    cwd,
    seconds,
    command,
    args: resolveDefaultArgs(agent, cwd, args)
  };
}

function resolveDefaultArgs(agent: string, cwd: string, overrides: string[]): string[] {
  if (overrides.length > 0) {
    return overrides;
  }
  if (agent === "codex") {
    return ["--no-alt-screen", "--dangerously-bypass-approvals-and-sandbox", "-C", cwd];
  }
  return [];
}

function redactHome(value: string): string {
  return value.replaceAll(homedir(), "~");
}

function renderMarkdownSummary(payload: {
  agent: string;
  command: string;
  args: string[];
  cwd: string;
  durationSeconds: number;
  startedAt: string;
  finishedAt: string;
  exit: { exitCode: number; signal: number };
  chunkCount: number;
  chunks: CapturedChunk[];
}): string {
  const lines = [
    `# ${payload.agent} idle sample`,
    "",
    `- command: \`${basename(payload.command)} ${payload.args.join(" ")}\``,
    `- cwd: \`${payload.cwd}\``,
    `- durationSeconds: ${payload.durationSeconds}`,
    `- startedAt: ${payload.startedAt}`,
    `- finishedAt: ${payload.finishedAt}`,
    `- exit: code=${payload.exit.exitCode} signal=${payload.exit.signal}`,
    `- chunkCount: ${payload.chunkCount}`,
    "",
    "| # | atMs | reason | meaningful | visible | preview |",
    "|---|---:|---|---|---:|---|"
  ];

  for (const chunk of payload.chunks) {
    lines.push(
      `| ${chunk.index} | ${chunk.atMs} | ${chunk.assessment.reason} | ${chunk.assessment.isMeaningfulActivity ? "yes" : "no"} | ${chunk.assessment.visibleCharacterCount} | \`${truncatePreview(chunk.assessment.normalized || chunk.data)}\` |`
    );
  }

  return `${lines.join("\n")}\n`;
}

function truncatePreview(value: string, maxLength = 72): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength)}...`;
}

await main();
