#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);

main().catch((error) => {
  print({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } });
  process.exitCode = 1;
});

async function main() {
  const command = args[0] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "doctor") {
    const discovery = discoverControl();
    print({ ok: true, discovery: redactDiscovery(discovery) });
    return;
  }
  if (command === "layout" && args[1] === "snapshot") {
    print(await rpc("layout.getSnapshot", {}));
    return;
  }
  if (command === "action" && args[1] === "list") {
    print(await rpc("action.list", {}));
    return;
  }
  if (command === "action" && args[1] === "describe") {
    const actionId = requireArg(args[2], "action id");
    print(await rpc("action.describe", { actionId }));
    return;
  }
  if (command === "action" && args[1] === "run") {
    const actionId = requireArg(args[2], "action id");
    const json = readOption("--json");
    const params = json ? JSON.parse(json) : {};
    print(await rpc(actionId, params));
    return;
  }
  if (command === "panel" && args[1] === "image") {
    const hostFilePath = requireOption("--file");
    const title = readOption("--title");
    const split = normalizeSplit(readOption("--split"));
    print(await rpc("panel.createImage", { hostFilePath, title, placement: { mode: split } }));
    return;
  }
  if (command === "panel" && args[1] === "browser") {
    const url = requireOption("--url");
    const title = readOption("--title");
    const split = normalizeSplit(readOption("--split"));
    print(await rpc("panel.createBrowser", { url, title, placement: { mode: split } }));
    return;
  }
  if (command === "panel" && args[1] === "close") {
    const panelId = requireArg(args[2], "panel id");
    print(await rpc("panel.close", { panelId }));
    return;
  }
  throw new Error(`Unknown command: ${args.join(" ")}`);
}

async function rpc(method, params) {
  const discovery = discoverControl();
  const response = await fetch(discovery.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${discovery.token}`
    },
    body: JSON.stringify({
      id: `watchboard-ui-${Date.now()}`,
      method,
      params
    })
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload?.error?.message ?? `Request failed with HTTP ${response.status}`);
  }
  return payload;
}

function discoverControl() {
  const endpoint = process.env.WATCHBOARD_UI_ENDPOINT;
  const token = process.env.WATCHBOARD_UI_TOKEN;
  if (endpoint && token) {
    return { url: endpoint, token, source: "env" };
  }
  const candidates = [
    join(homedir(), ".config", "agent-watchboard", "control.json"),
    ...findMountedWindowsDiscoveryFiles()
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    const parsed = JSON.parse(readFileSync(candidate, "utf8"));
    if (parsed?.url && parsed?.token) {
      return { url: parsed.url, token: parsed.token, source: candidate };
    }
  }
  throw new Error("Agent Watchboard control discovery was not found. Start the desktop app or set WATCHBOARD_UI_ENDPOINT and WATCHBOARD_UI_TOKEN.");
}

function findMountedWindowsDiscoveryFiles() {
  const usersRoot = "/mnt/c/Users";
  if (!existsSync(usersRoot)) {
    return [];
  }
  return readdirSync(usersRoot)
    .map((name) => join(usersRoot, name, "AppData", "Roaming", "agent-watchboard", "control.json"))
    .filter((path) => existsSync(path))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
}

function readOption(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function requireOption(name) {
  const value = readOption(name);
  if (!value) {
    throw new Error(`Missing required option ${name}`);
  }
  return value;
}

function requireArg(value, label) {
  if (!value) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function normalizeSplit(value) {
  if (!value || value === "right" || value === "down" || value === "tab") {
    return value ?? "right";
  }
  throw new Error("--split must be one of: right, down, tab");
}

function redactDiscovery(discovery) {
  return {
    ...discovery,
    token: discovery.token ? "<redacted>" : ""
  };
}

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`watchboard-ui

Commands:
  watchboard-ui doctor
  watchboard-ui layout snapshot
  watchboard-ui action list
  watchboard-ui action describe <actionId>
  watchboard-ui action run <actionId> --json '<params>'
  watchboard-ui panel image --file <host-path> [--title <title>] [--split right|down|tab]
  watchboard-ui panel browser --url <url> [--title <title>] [--split right|down|tab]
  watchboard-ui panel close <panelId>
`);
}
