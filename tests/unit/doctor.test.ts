import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildDoctorRunSpec, getDoctorTargetKey } from "../../src/main/doctor";
import { readDoctorDiagnostics, upsertDoctorCheckResult, writeDoctorPersistenceHealth } from "../../src/shared/doctorDiagnostics";

test("getDoctorTargetKey is stable for location and agent pairs", () => {
  assert.equal(getDoctorTargetKey("host", "codex"), "host:codex");
  assert.equal(getDoctorTargetKey("wsl", "claude"), "wsl:claude");
});

test("buildDoctorRunSpec creates a host codex exec invocation with temp output capture", async () => {
  const appDataDir = mkdtempSync(join(tmpdir(), "watchboard-doctor-"));
  const spec = await buildDoctorRunSpec("host", "codex", {
    platform: "linux",
    hostHome: "/tmp/home",
    appDataDir
  });

  assert.equal(spec.command, "codex");
  assert.equal(spec.cwd, "/tmp/home");
  assert.ok(spec.tempOutputPath);
  assert.ok(spec.args.includes("exec"));
  assert.ok(spec.args.includes("--output-last-message"));
});

test("buildDoctorRunSpec creates a host claude print invocation", async () => {
  const appDataDir = mkdtempSync(join(tmpdir(), "watchboard-doctor-"));
  const spec = await buildDoctorRunSpec("host", "claude", {
    platform: "linux",
    hostHome: "/tmp/home",
    appDataDir
  });

  assert.equal(spec.command, "claude");
  assert.deepEqual(spec.args.slice(0, 5), ["-p", "--output-format", "text", "--permission-mode", "bypassPermissions"]);
});

test("doctor diagnostics persistence upserts the latest result by target key", async () => {
  const root = mkdtempSync(join(tmpdir(), "watchboard-doctor-store-"));
  const filePath = join(root, "doctor-diagnostics.json");

  await upsertDoctorCheckResult(
    {
      key: "host:codex",
      agent: "codex",
      location: "host",
      status: "success",
      commandSummary: "codex exec",
      cwd: "/tmp/home",
      stdout: "OK",
      stderr: "",
      lastMessage: "OK",
      exitCode: 0,
      errorMessage: "",
      startedAt: "2026-03-13T00:00:00.000Z",
      finishedAt: "2026-03-13T00:00:01.000Z",
      durationMs: 1000
    },
    filePath
  );

  const document = await readDoctorDiagnostics(filePath);
  assert.equal(document.results["host:codex"]?.lastMessage, "OK");
});

test("doctor diagnostics persistence stores persistence-health snapshots", async () => {
  const root = mkdtempSync(join(tmpdir(), "watchboard-doctor-store-"));
  const filePath = join(root, "doctor-diagnostics.json");

  await writeDoctorPersistenceHealth(
    [
      {
        key: "workspaces",
        path: "/tmp/workspaces.json",
        status: "corrupted",
        recoveryMode: true,
        backupPaths: ["/tmp/workspaces.json.1.bak"]
      }
    ],
    filePath
  );

  const document = await readDoctorDiagnostics(filePath);
  assert.equal(document.persistenceHealth[0]?.key, "workspaces");
  assert.equal(document.persistenceHealth[0]?.status, "corrupted");
});
