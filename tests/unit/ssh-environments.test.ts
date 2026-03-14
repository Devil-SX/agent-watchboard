import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { testSshConnection } from "../../src/main/sshConnection";
import { mergeSshSecretsIntoSettings } from "../../src/main/sshSecrets";
import { buildSshStartupCommand, createDefaultAppSettings } from "../../src/shared/schema";

const crypto = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`enc:${value}`, "utf8"),
  decryptString: (value: Buffer) => value.toString("utf8").replace(/^enc:/, "")
};

test("mergeSshSecretsIntoSettings stores encrypted credentials outside settings metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-ssh-secrets-"));
  const secretsPath = join(dir, "ssh-secrets.json");
  const settings = createDefaultAppSettings({
    sshEnvironments: [
      {
        id: "env-1",
        name: "Prod SSH",
        host: "prod.example.com",
        port: 22,
        username: "deploy",
        authMode: "password",
        privateKeyPath: "",
        remoteCommand: "",
        savePassword: true,
        savePassphrase: false,
        hasSavedPassword: false,
        hasSavedPassphrase: false
      }
    ]
  });

  const merged = await mergeSshSecretsIntoSettings(
    settings,
    secretsPath,
    {
      "env-1": {
        password: "super-secret"
      }
    },
    crypto
  );

  const raw = await readFile(secretsPath, "utf8");

  assert.equal(merged.sshEnvironments[0]?.hasSavedPassword, true);
  assert.equal(merged.sshEnvironments[0]?.hasSavedPassphrase, false);
  assert.doesNotMatch(raw, /super-secret/);
  assert.match(raw, /"encrypted":/);
});

test("buildSshStartupCommand includes SSH key args and remote command", () => {
  const command = buildSshStartupCommand({
    host: "prod.example.com",
    port: 2222,
    username: "deploy",
    authMode: "key",
    privateKeyPath: "~/.ssh/id_ed25519",
    remoteCommand: "tmux attach"
  });

  assert.match(command, /^ssh -p 2222 -i /);
  assert.match(command, /deploy@prod\.example\.com/);
  assert.match(command, /tmux attach/);
});

test("testSshConnection rejects password auth without a password", async () => {
  const result = await testSshConnection({
    name: "Prod SSH",
    host: "prod.example.com",
    port: 22,
    username: "deploy",
    authMode: "password",
    privateKeyPath: "",
    remoteCommand: ""
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /password is required/i);
});

test("testSshConnection forwards ssh args to the injected runner", async () => {
  let recordedArgs: string[] = [];
  const result = await testSshConnection(
    {
      name: "Prod SSH",
      host: "prod.example.com",
      port: 2201,
      username: "deploy",
      authMode: "key",
      privateKeyPath: "~/.ssh/id_ed25519",
      remoteCommand: "tmux attach"
    },
    {
      passphrase: "secret"
    },
    {
      createAskpass: async () => ({
        env: { SSH_ASKPASS: "/tmp/askpass" },
        cleanup: async () => undefined
      }),
      runProcess: async (args) => {
        recordedArgs = args;
        return {
          ok: true,
          message: "ok"
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(recordedArgs.slice(0, 8), [
    "-o",
    "BatchMode=no",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    `UserKnownHostsFile=${process.platform === "win32" ? "NUL" : "/dev/null"}`
  ]);
  assert.ok(recordedArgs.includes("-i"));
  assert.ok(recordedArgs.includes("deploy@prod.example.com"));
  assert.ok(recordedArgs.includes("tmux attach"));
});
