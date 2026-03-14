import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import type { SshEnvironment } from "@shared/schema";
import type { SshSecretPayload } from "./sshSecrets";

export type SshTestResult = {
  ok: boolean;
  message: string;
};

export async function testSshConnection(
  environment: Pick<SshEnvironment, "name" | "host" | "port" | "username" | "authMode" | "privateKeyPath" | "remoteCommand">,
  secrets: SshSecretPayload = {},
  options: {
    runProcess?: (args: string[], extraEnv?: NodeJS.ProcessEnv) => Promise<SshTestResult>;
    createAskpass?: (secret: string) => Promise<{ env: NodeJS.ProcessEnv; cleanup: () => Promise<void> }>;
  } = {}
): Promise<SshTestResult> {
  const host = environment.host.trim();
  const username = environment.username.trim();
  if (!host || !username) {
    return { ok: false, message: "Host and username are required." };
  }
  if (environment.authMode === "key" && !environment.privateKeyPath.trim()) {
    return { ok: false, message: "Private key path is required for key-based SSH auth." };
  }
  if (environment.authMode === "password" && !secrets.password?.trim()) {
    return { ok: false, message: "A saved or temporary password is required for password-based SSH auth." };
  }

  const knownHostsNull = process.platform === "win32" ? "NUL" : "/dev/null";
  const args = [
    "-o",
    "BatchMode=no",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    `UserKnownHostsFile=${knownHostsNull}`
  ];

  if (environment.port > 0) {
    args.push("-p", String(environment.port));
  }

  if (environment.authMode === "password") {
    args.push("-o", "PreferredAuthentications=password,keyboard-interactive");
  } else {
    args.push("-o", "PreferredAuthentications=publickey");
    args.push("-i", environment.privateKeyPath.trim());
  }

  args.push(`${username}@${host}`);
  args.push(environment.remoteCommand.trim() || "exit");

  const askpassSecret = environment.authMode === "password" ? secrets.password?.trim() : secrets.passphrase?.trim();
  const askpass = askpassSecret ? await (options.createAskpass ?? createAskpassProgram)(askpassSecret) : null;

  try {
    const result = await (options.runProcess ?? runSshProcess)(args, askpass?.env);
    if (result.ok) {
      return {
        ok: true,
        message: `SSH connection to ${environment.name || host} succeeded.`
      };
    }
    return result;
  } finally {
    await askpass?.cleanup();
  }
}

async function createAskpassProgram(secret: string): Promise<{ env: NodeJS.ProcessEnv; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-askpass-"));
  const secretPath = join(dir, "secret.txt");
  const scriptPath = join(dir, process.platform === "win32" ? "askpass.cmd" : "askpass.sh");

  await writeFile(secretPath, secret, "utf8");

  if (process.platform === "win32") {
    await writeFile(scriptPath, '@echo off\r\ntype "%WATCHBOARD_SSH_SECRET_FILE%"\r\n', "utf8");
  } else {
    await writeFile(scriptPath, '#!/bin/sh\ncat "$WATCHBOARD_SSH_SECRET_FILE"\n', "utf8");
    await chmod(scriptPath, 0o700);
    await chmod(secretPath, 0o600);
  }

  return {
    env: {
      ...process.env,
      SSH_ASKPASS: scriptPath,
      SSH_ASKPASS_REQUIRE: "force",
      WATCHBOARD_SSH_SECRET_FILE: secretPath,
      DISPLAY: process.platform === "win32" ? process.env.DISPLAY ?? "watchboard" : ":0"
    },
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

function runSshProcess(args: string[], extraEnv?: NodeJS.ProcessEnv): Promise<SshTestResult> {
  return new Promise((resolve) => {
    const child = spawn("ssh", args, {
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timeout = setTimeout(() => {
      child.kill();
      complete({
        ok: false,
        message: "SSH test timed out after 10 seconds."
      });
    }, 10000);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      complete({
        ok: false,
        message: `Failed to launch ssh: ${error.message}`
      });
    });
    child.on("close", (code) => {
      if (code === 0) {
        complete({
          ok: true,
          message: stdout.trim() || "SSH connection succeeded."
        });
        return;
      }
      complete({
        ok: false,
        message: stderr.trim() || stdout.trim() || `SSH exited with code ${code ?? "unknown"}.`
      });
    });

    function complete(result: SshTestResult): void {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      resolve(result);
    }
  });
}
