import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { AnalysisWorkerClient } from "../../src/main/analysisWorkerClient";
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from "../../src/main/analysisWorkerProtocol";

class FakeWorker extends EventEmitter {
  public readonly postedRequests: AnalysisWorkerRequest[] = [];
  public terminated = false;

  postMessage(request: AnalysisWorkerRequest): void {
    this.postedRequests.push(request);
  }

  async terminate(): Promise<number> {
    this.terminated = true;
    this.emit("exit", 0);
    return 0;
  }
}

test("AnalysisWorkerClient resolves responses and replays telemetry", async () => {
  const worker = new FakeWorker();
  const perfNames: string[] = [];
  const logLevels: string[] = [];
  const client = new AnalysisWorkerClient({
    createWorker: () => worker,
    onPerfEvent: (event) => {
      perfNames.push(event.name);
    },
    onLogEvent: (event) => {
      logLevels.push(`${event.level}:${event.event}`);
    }
  });

  const pending = client.run({
    operation: "inspect",
    location: "host",
    filePath: "/tmp/profiler.db"
  });

  const request = worker.postedRequests[0];
  assert.ok(request);

  const response: AnalysisWorkerResponse = {
    id: request.id,
    ok: true,
    result: {
      location: "host",
      status: "ready",
      displayPath: "~/.agent-vis/profiler.db",
      error: null,
      tableNames: ["sessions", "session_statistics", "tracked_files"],
      sessionCount: 1,
      totalFiles: 1,
      lastParsedAt: null
    },
    perfEvents: [{ name: "inspect-sql", durationMs: 1.5 }],
    logEvents: [{ level: "warn", event: "analysis-db-direct-read-locked", payload: { path: "/tmp/profiler.db" } }]
  };
  worker.emit("message", response);

  const result = await pending;
  assert.equal((result as { status?: string }).status, "ready");
  assert.deepEqual(perfNames, ["inspect-sql"]);
  assert.deepEqual(logLevels, ["warn:analysis-db-direct-read-locked"]);

  await client.terminate();
  assert.equal(worker.terminated, true);
});

test("AnalysisWorkerClient rejects pending requests when the worker exits unexpectedly", async () => {
  const worker = new FakeWorker();
  const client = new AnalysisWorkerClient({
    createWorker: () => worker
  });

  const pending = client.run({
    operation: "inspect",
    location: "host",
    filePath: "/tmp/profiler.db"
  });

  worker.emit("exit", 9);

  await assert.rejects(pending, /Analysis worker exited with code 9/);

  const retry = client.run({
    operation: "inspect",
    location: "host",
    filePath: "/tmp/profiler.db"
  });
  const retryRequest = worker.postedRequests.at(-1);
  assert.ok(retryRequest);
  worker.emit("message", {
    id: retryRequest.id,
    ok: true,
    result: null,
    perfEvents: [],
    logEvents: []
  } satisfies AnalysisWorkerResponse);
  await retry;
});
