import test from "node:test";
import assert from "node:assert/strict";
import { buildSshStartupCommand } from "../../src/shared/schema";

test("buildSshStartupCommand with empty host and username returns an empty command", () => {
  const result = buildSshStartupCommand({
    host: "",
    port: 22,
    username: "",
    authMode: "password",
    privateKeyPath: "",
    remoteCommand: ""
  });
  assert.equal(result, "");
});

test("buildSshStartupCommand with whitespace-only host returns an empty command", () => {
  const result = buildSshStartupCommand({
    host: "   ",
    port: 22,
    username: "   ",
    authMode: "password",
    privateKeyPath: "",
    remoteCommand: ""
  });
  assert.equal(result, "");
});

test("buildSshStartupCommand with only username and no host returns an empty command", () => {
  const result = buildSshStartupCommand({
    host: "",
    port: 22,
    username: "deploy",
    authMode: "password",
    privateKeyPath: "",
    remoteCommand: ""
  });
  assert.equal(result, "");
});

test("buildSshStartupCommand still supports host-only targets", () => {
  const result = buildSshStartupCommand({
    host: "prod.example.com",
    port: 22,
    username: "",
    authMode: "password",
    privateKeyPath: "",
    remoteCommand: ""
  });

  assert.equal(result, "ssh 'prod.example.com'");
});
