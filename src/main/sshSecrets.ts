import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { nowIso, type AppSettings, type SshEnvironment } from "@shared/schema";

type PersistedSecretEntry = {
  encrypted: string;
  hasPassword: boolean;
  hasPassphrase: boolean;
};

type PersistedSecretDocument = {
  version: 1;
  updatedAt: string;
  environments: Record<string, PersistedSecretEntry>;
};

export type SshSecretPayload = {
  password?: string;
  passphrase?: string;
};

type SecretCrypto = {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
};

const defaultCrypto: SecretCrypto = {
  isEncryptionAvailable: () => resolveSafeStorage().isEncryptionAvailable(),
  encryptString: (value) => resolveSafeStorage().encryptString(value),
  decryptString: (value) => resolveSafeStorage().decryptString(value)
};

const writeQueues = new Map<string, Promise<void>>();
const require = createRequire(import.meta.url);

export async function mergeSshSecretsIntoSettings(
  settings: AppSettings,
  filePath: string,
  updates?: Record<string, SshSecretPayload>,
  crypto: SecretCrypto = defaultCrypto
): Promise<AppSettings> {
  const document = await readSecretDocument(filePath);
  const nextEntries = { ...document.environments };
  const nextIds = new Set(settings.sshEnvironments.map((environment) => environment.id));

  for (const staleId of Object.keys(nextEntries)) {
    if (!nextIds.has(staleId)) {
      delete nextEntries[staleId];
    }
  }

  const sshEnvironments = settings.sshEnvironments.map((environment) => {
    const incoming = updates?.[environment.id];
    const currentSecrets = readSecretsFromEntry(nextEntries[environment.id], crypto);
    const password = environment.savePassword ? coerceSecret(incoming?.password) ?? currentSecrets.password : undefined;
    const passphrase =
      environment.savePassphrase ? coerceSecret(incoming?.passphrase) ?? currentSecrets.passphrase : undefined;

    if (password || passphrase) {
      ensureEncryptionAvailable(crypto);
      nextEntries[environment.id] = createSecretEntry({ password, passphrase }, crypto);
    } else {
      delete nextEntries[environment.id];
    }

    return {
      ...environment,
      hasSavedPassword: Boolean(password),
      hasSavedPassphrase: Boolean(passphrase)
    };
  });

  await writeSecretDocument(
    {
      version: 1,
      updatedAt: nowIso(),
      environments: nextEntries
    },
    filePath
  );

  return {
    ...settings,
    sshEnvironments
  };
}

export async function attachSshSecretFlags(settings: AppSettings, filePath: string): Promise<AppSettings> {
  const document = await readSecretDocument(filePath);
  return {
    ...settings,
    sshEnvironments: settings.sshEnvironments.map((environment) => ({
      ...environment,
      hasSavedPassword: document.environments[environment.id]?.hasPassword ?? false,
      hasSavedPassphrase: document.environments[environment.id]?.hasPassphrase ?? false
    }))
  };
}

export async function loadSshSecrets(
  environmentId: string,
  filePath: string,
  crypto: SecretCrypto = defaultCrypto
): Promise<SshSecretPayload> {
  const document = await readSecretDocument(filePath);
  return readSecretsFromEntry(document.environments[environmentId], crypto);
}

function ensureEncryptionAvailable(crypto: SecretCrypto): void {
  if (!crypto.isEncryptionAvailable()) {
    throw new Error("Secure credential storage is unavailable on this system.");
  }
}

function resolveSafeStorage(): {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
} {
  const electron = require("electron") as {
    safeStorage?: {
      isEncryptionAvailable(): boolean;
      encryptString(value: string): Buffer;
      decryptString(value: Buffer): string;
    };
  };
  if (!electron.safeStorage) {
    throw new Error("Electron safeStorage is unavailable in this runtime.");
  }
  return electron.safeStorage;
}

function createSecretEntry(payload: SshSecretPayload, crypto: SecretCrypto): PersistedSecretEntry {
  const normalized = {
    ...(payload.password ? { password: payload.password } : {}),
    ...(payload.passphrase ? { passphrase: payload.passphrase } : {})
  };
  const encrypted = crypto.encryptString(JSON.stringify(normalized)).toString("base64");
  return {
    encrypted,
    hasPassword: Boolean(payload.password),
    hasPassphrase: Boolean(payload.passphrase)
  };
}

function readSecretsFromEntry(entry: PersistedSecretEntry | undefined, crypto: SecretCrypto): SshSecretPayload {
  if (!entry) {
    return {};
  }
  ensureEncryptionAvailable(crypto);
  try {
    const decrypted = crypto.decryptString(Buffer.from(entry.encrypted, "base64"));
    const parsed = JSON.parse(decrypted) as SshSecretPayload;
    return {
      ...(coerceSecret(parsed.password) ? { password: coerceSecret(parsed.password) } : {}),
      ...(coerceSecret(parsed.passphrase) ? { passphrase: coerceSecret(parsed.passphrase) } : {})
    };
  } catch (error) {
    throw new Error(`Failed to decrypt stored SSH credentials: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function coerceSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

async function readSecretDocument(filePath: string): Promise<PersistedSecretDocument> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as PersistedSecretDocument;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
      environments: typeof parsed.environments === "object" && parsed.environments ? parsed.environments : {}
    };
  } catch {
    return {
      version: 1,
      updatedAt: nowIso(),
      environments: {}
    };
  }
}

async function writeSecretDocument(document: PersistedSecretDocument, filePath: string): Promise<void> {
  await enqueueWrite(filePath, async () => {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(document, null, 2), "utf8");
  });
}

async function enqueueWrite(filePath: string, task: () => Promise<void>): Promise<void> {
  const pending = writeQueues.get(filePath) ?? Promise.resolve();
  const next = pending.catch(() => undefined).then(task);
  writeQueues.set(filePath, next);
  try {
    await next;
  } finally {
    if (writeQueues.get(filePath) === next) {
      writeQueues.delete(filePath);
    }
  }
}

export function extractSecretSavePayload(
  environment: Pick<SshEnvironment, "authMode" | "savePassword" | "savePassphrase">,
  secrets: SshSecretPayload
): SshSecretPayload {
  return {
    ...(environment.savePassword && coerceSecret(secrets.password) ? { password: coerceSecret(secrets.password) } : {}),
    ...(environment.savePassphrase && coerceSecret(secrets.passphrase) ? { passphrase: coerceSecret(secrets.passphrase) } : {})
  };
}
