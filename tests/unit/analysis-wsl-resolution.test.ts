import test from "node:test";
import assert from "node:assert/strict";

import { createStaticWslResolver, resolveAnalysisWslHomePath, type AnalysisWslLogEvent, type AnalysisWslPerfEvent } from "../../src/main/analysisWslResolution";

test("resolveAnalysisWslHomePath emits stage perf events and redacted logs", async () => {
  const perfEvents: AnalysisWslPerfEvent[] = [];
  const logEvents: AnalysisWslLogEvent[] = [];

  const homePath = await resolveAnalysisWslHomePath({
    platform: "win32",
    resolveDistro: createStaticWslResolver("Ubuntu", "cache"),
    resolveHome: async () => ({
      value: "/home/tester",
      source: "wsl.exe"
    }),
    onPerf: (event) => {
      perfEvents.push(event);
    },
    onLog: (event) => {
      logEvents.push(event);
    }
  });

  assert.equal(homePath, "\\\\wsl.localhost\\Ubuntu\\home\\tester");
  assert.deepEqual(
    perfEvents.map((event) => event.name),
    ["wsl-distro-resolve", "wsl-home-resolve", "wsl-analysis-home-resolve"]
  );
  assert.equal(logEvents[0]?.event, "analysis-wsl-path-stage");
  assert.deepEqual(logEvents[0]?.payload.stage, "distro");
  assert.equal(logEvents[1]?.payload.stage, "home");
  assert.equal(logEvents[2]?.event, "analysis-wsl-path-resolved");
  assert.equal(logEvents[2]?.payload.homePath, "\\\\wsl.localhost\\Ubuntu\\~");
  assert.equal(typeof logEvents[2]?.payload.durationMs, "number");
});

test("resolveAnalysisWslHomePath emits a warning path when WSL resolution fails", async () => {
  const perfEvents: AnalysisWslPerfEvent[] = [];
  const logEvents: AnalysisWslLogEvent[] = [];

  const homePath = await resolveAnalysisWslHomePath({
    platform: "win32",
    resolveDistro: async () => {
      throw new Error("wsl.exe timeout");
    },
    onPerf: (event) => {
      perfEvents.push(event);
    },
    onLog: (event) => {
      logEvents.push(event);
    }
  });

  assert.equal(homePath, null);
  assert.deepEqual(perfEvents.map((event) => event.name), ["wsl-analysis-home-resolve-failed"]);
  assert.equal(logEvents[0]?.level, "warn");
  assert.equal(logEvents[0]?.event, "analysis-wsl-path-resolve-failed");
  assert.equal(logEvents[0]?.payload.error, "wsl.exe timeout");
});

test("resolveAnalysisWslHomePath prefers the configured distro when provided", async () => {
  let preferredDistro: string | undefined;

  const homePath = await resolveAnalysisWslHomePath({
    platform: "win32",
    preferredDistro: "Ubuntu-22.04",
    resolveDistro: async (preferred) => {
      preferredDistro = preferred;
      return {
        value: preferred ?? "Ubuntu",
        source: "preferred"
      };
    },
    resolveHome: async (distro) => ({
      value: distro === "Ubuntu-22.04" ? "/home/demo" : "/home/fallback",
      source: "wsl.exe"
    })
  });

  assert.equal(preferredDistro, "Ubuntu-22.04");
  assert.equal(homePath, "\\\\wsl.localhost\\Ubuntu-22.04\\home\\demo");
});

test("resolveAnalysisWslHomePath skips WSL probing outside Windows", async () => {
  let called = false;

  const homePath = await resolveAnalysisWslHomePath({
    platform: "linux",
    resolveDistro: async () => {
      called = true;
      return {
        value: "Ubuntu",
        source: "cache" as const
      };
    }
  });

  assert.equal(homePath, null);
  assert.equal(called, false);
});
