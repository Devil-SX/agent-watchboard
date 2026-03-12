import { mkdirSync, createWriteStream, type WriteStream } from "node:fs";
import { dirname } from "node:path";

type LoggerOptions = {
  filePath: string;
  name: string;
  append?: boolean;
};

export class FileLogger {
  private readonly filePath: string;
  private readonly name: string;
  private readonly append: boolean;
  private stream: WriteStream | null = null;

  constructor(options: LoggerOptions) {
    this.filePath = options.filePath;
    this.name = options.name;
    this.append = options.append ?? true;
  }

  info(message: string, details?: unknown): void {
    this.write("INFO", message, details);
  }

  warn(message: string, details?: unknown): void {
    this.write("WARN", message, details);
  }

  error(message: string, details?: unknown): void {
    this.write("ERROR", message, details);
  }

  raw(chunk: string): void {
    this.ensureStream().write(chunk);
  }

  close(): void {
    this.stream?.end();
    this.stream = null;
  }

  private write(level: "INFO" | "WARN" | "ERROR", message: string, details?: unknown): void {
    const suffix = details === undefined ? "" : ` ${stringifyDetails(details)}`;
    this.ensureStream().write(`[${new Date().toISOString()}] [${this.name}] [${level}] ${message}${suffix}\n`);
  }

  private ensureStream(): WriteStream {
    if (this.stream) {
      return this.stream;
    }
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.stream = createWriteStream(this.filePath, { flags: this.append ? "a" : "w", encoding: "utf8" });
    return this.stream;
  }
}

function stringifyDetails(details: unknown): string {
  if (details instanceof Error) {
    return JSON.stringify({
      name: details.name,
      message: details.message,
      stack: details.stack
    });
  }
  if (typeof details === "string") {
    return details;
  }
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}
