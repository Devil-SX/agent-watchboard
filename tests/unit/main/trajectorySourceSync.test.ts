import assert from "node:assert/strict";
import { test } from "node:test";
import { TrajectorySourceSync, sharedSourceSyncCommand } from "../../../src/main/trajectorySourceSync";

test("Linux and Windows call the same stable uploader/config without a shell", () => {
  const linux = sharedSourceSyncCommand("linux", "/home/user with spaces");
  const windows = sharedSourceSyncCommand("win32", "/home/user with spaces", "Ubuntu-22.04");
  assert.equal(linux.file, "python3");
  assert.equal(windows.file, "wsl.exe");
  assert.deepEqual(windows.args.slice(3), [linux.file, ...linux.args]);
  assert.ok(linux.args.includes("/home/user with spaces/.config/trajectory/source-sync.json"));
  assert.equal(linux.args.at(-1), "1");
});

test("multiple triggers reuse a single active invocation", async () => {
  let calls = 0;
  let resolve!: (value: { stdout: string }) => void;
  const sync = new TrajectorySourceSync({ platform: "linux", home: "/home/user",
    distro: async () => "unused", wslHome: async () => "/unused",
    launch: async () => { calls++; return new Promise(done => { resolve = done; }); } });
  const first = sync.trigger();
  const second = sync.trigger();
  assert.equal(first, second);
  assert.equal(calls, 1);
  resolve({ stdout: '{"chunks":1,"uploaded_bytes":42}' });
  assert.deepEqual(await first, { state: "complete", chunks: 1, uploadedBytes: 42 });
});

test("failed or locked shared uploader defers and permits the next trigger", async () => {
  let calls = 0;
  const sync = new TrajectorySourceSync({ platform: "linux", home: "/home/user",
    distro: async () => "unused", wslHome: async () => "/unused",
    launch: async () => { if (++calls === 1) throw new Error("occupied lock");
      return { stdout: '{"chunks":0,"uploaded_bytes":0}' }; } });
  assert.deepEqual(await sync.trigger(), { state: "deferred" });
  assert.deepEqual(await sync.trigger(), { state: "complete", chunks: 0, uploadedBytes: 0 });
});

test("Windows uses the configured distro and rejects malformed receipts", async () => {
  let selected = "";
  const sync = new TrajectorySourceSync({ platform: "win32", home: "C:/Users/user",
    distro: async preferred => { selected = preferred || ""; return selected; },
    wslHome: async () => "/home/user",
    launch: async (file, args) => { assert.equal(file, "wsl.exe"); assert.equal(args[1], "Ubuntu-22.04");
      return { stdout: '{"chunks":-1,"uploaded_bytes":0}' }; } });
  assert.deepEqual(await sync.trigger("Ubuntu-22.04"), { state: "deferred" });
  assert.equal(selected, "Ubuntu-22.04");
});
