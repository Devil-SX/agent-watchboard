import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = "/home/sdu/pure_auto/agent_watchboard";
const CLI_ENTRY = join(REPO_ROOT, "src/cli/todo-preview.ts");

test("todo_preview CLI batch applies multiple operations atomically", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-cli-"));
  const boardPath = join(dir, "board.json");
  const opsPath = join(dir, "ops.json");

  await writeFile(
    opsPath,
    JSON.stringify(
      [
        { op: "add", topic: "Circuit", name: "SRAM data analysis", history: "captured traces", next: "summarize bank conflicts" },
        { op: "add", topic: "Circuit", name: "Compute unit analysis" },
        { op: "ddl", name: "SRAM data analysis", date: "2026-03-20" },
        { op: "doing", name: "SRAM data analysis" }
      ],
      null,
      2
    ),
    "utf8"
  );

  await runCli(["--file", boardPath, "batch", opsPath]);
  const board = JSON.parse(await readFile(boardPath, "utf8")) as {
    sections: Array<{ name: string; items: Array<{ name: string; status: string; deadlineAt: string | null; history: string; next: string }> }>;
  };

  const circuit = board.sections.find((section) => section.name === "Circuit");
  const sram = circuit?.items.find((item) => item.name === "SRAM data analysis");
  const compute = circuit?.items.find((item) => item.name === "Compute unit analysis");

  assert.ok(circuit);
  assert.ok(sram);
  assert.ok(compute);
  assert.equal(sram?.status, "doing");
  assert.equal(sram?.deadlineAt, "2026-03-20");
  assert.equal(sram?.history, "captured traces");
  assert.equal(sram?.next, "summarize bank conflicts");
});

test("todo_preview CLI preserves concurrent add operations across separate processes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-cli-"));
  const boardPath = join(dir, "board.json");

  await Promise.all([
    runCli(["--file", boardPath, "add", "SRAM data analysis", "--topic", "Circuit"]),
    runCli(["--file", boardPath, "add", "Compute unit analysis", "--topic", "Circuit"]),
    runCli(["--file", boardPath, "add", "Voltage droop survey", "--topic", "Circuit"])
  ]);

  const board = JSON.parse(await readFile(boardPath, "utf8")) as {
    sections: Array<{ name: string; items: Array<{ name: string }> }>;
  };
  const circuit = board.sections.find((section) => section.name === "Circuit");
  const names = circuit?.items.map((item) => item.name).sort() ?? [];

  assert.deepEqual(names, ["Compute unit analysis", "SRAM data analysis", "Voltage droop survey"].sort());
});

test("todo_preview CLI list renders expected markers after mutations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-cli-"));
  const boardPath = join(dir, "board.json");

  await runCli([
    "--file",
    boardPath,
    "add",
    "Investigate CI failure",
    "--topic",
    "Inbox",
    "--history",
    "first pass",
    "--next",
    "re-run flaky job"
  ]);
  await runCli(["--file", boardPath, "doing", "Investigate CI failure"]);

  const output = await runCli(["--file", boardPath, "list"]);

  assert.match(output, /# Inbox/);
  assert.match(output, /- \[sprout\] Investigate CI failure - next re-run flaky job · history first pass/);
});

async function runCli(args: string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", CLI_ENTRY, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`todo_preview exited with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}
