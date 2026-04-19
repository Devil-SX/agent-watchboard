import { readFileSync } from "node:fs";

import { Command } from "commander";

import { discoverSessions, expandAndResolve, type SessionEntry } from "@shared/sessionDiscovery";

function parseEcosystem(options: { claude?: boolean; codex?: boolean }): "claude" | "codex" | undefined {
  if (options.claude && !options.codex) return "claude";
  if (options.codex && !options.claude) return "codex";
  return undefined;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function formatTable(entries: SessionEntry[]): string {
  if (entries.length === 0) return "No sessions found.";

  const header = ["Ecosystem", "Session ID", "Size", "Last Modified"];
  const rows = entries.map((e) => [
    e.ecosystem,
    e.sessionId.length > 36 ? e.sessionId.slice(0, 36) : e.sessionId,
    formatSize(e.sizeBytes),
    e.modifiedAt.replace("T", " ").replace(/\.\d+Z$/, "Z")
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0))
  );

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i]!)).join("  ");
  const sep = widths.map((w) => "─".repeat(w)).join("──");

  return [line(header), sep, ...rows.map(line)].join("\n");
}

const program = new Command();

program
  .name("session_log")
  .description("Query and fetch agent session logs for a project path.");

program
  .command("query")
  .description("List sessions for a project path")
  .argument("<path>", "Project path (supports . ~ relative paths)")
  .option("--claude", "Only show Claude Code sessions")
  .option("--codex", "Only show Codex sessions")
  .action((inputPath: string, options: { claude?: boolean; codex?: boolean }) => {
    const absPath = expandAndResolve(inputPath);
    const ecosystem = parseEcosystem(options);
    const entries = discoverSessions(absPath, ecosystem);

    if (entries.length === 0) {
      console.log(`No sessions found for ${absPath}`);
      if (ecosystem) console.log(`(filtered to ${ecosystem})`);
      return;
    }

    console.log(`Sessions for ${absPath} (${entries.length} found):\n`);
    console.log(formatTable(entries));
  });

program
  .command("fetch")
  .description("Print a session log to stdout")
  .argument("<path>", "Project path (supports . ~ relative paths)")
  .option("--claude", "Only search Claude Code sessions")
  .option("--codex", "Only search Codex sessions")
  .option("--newest", "Fetch the most recently modified session")
  .option("--id <sessionId>", "Fetch a specific session by ID")
  .option("--full", "Print the complete session without truncation")
  .option("--limit <chars>", "Truncation limit in characters (default: 100000)", "100000")
  .action(
    (
      inputPath: string,
      options: { claude?: boolean; codex?: boolean; newest?: boolean; id?: string; full?: boolean; limit?: string }
    ) => {
      const absPath = expandAndResolve(inputPath);
      const ecosystem = parseEcosystem(options);
      const entries = discoverSessions(absPath, ecosystem);

      if (entries.length === 0) {
        console.error(`No sessions found for ${absPath}`);
        process.exit(1);
      }

      let target: SessionEntry | undefined;

      if (options.id) {
        target = entries.find((e) => e.sessionId === options.id || e.sessionId.startsWith(options.id!));
        if (!target) {
          console.error(`Session ${options.id} not found. Use 'query' to list available sessions.`);
          process.exit(1);
        }
      } else {
        // Default to newest
        target = entries[0];
      }

      if (!target) {
        console.error("No session matched.");
        process.exit(1);
      }

      const maxChars = options.full ? Infinity : Number(options.limit) || 100_000;
      const content = readFileSync(target.filePath, "utf8");
      const truncated = !options.full && content.length > maxChars;

      // Print metadata header to stderr so stdout is clean JSONL
      console.error(`# ${target.ecosystem} session ${target.sessionId}`);
      console.error(`# modified: ${target.modifiedAt}`);
      console.error(`# size: ${formatSize(target.sizeBytes)} (${content.length} chars)`);
      console.error(`# file: ${target.filePath}`);
      if (truncated) {
        console.error(`# TRUNCATED to ${formatSize(maxChars)} of ${formatSize(content.length)} (use --full for complete output)`);
      }

      if (truncated) {
        // Truncate at last complete line within the limit
        const slice = content.slice(0, maxChars);
        const lastNewline = slice.lastIndexOf("\n");
        process.stdout.write(lastNewline >= 0 ? slice.slice(0, lastNewline + 1) : slice);
      } else {
        process.stdout.write(content);
      }
    }
  );

void program.parseAsync(process.argv);
