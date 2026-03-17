import WebSocket from "ws";

import {
  DEFAULT_SUPERVISOR_PORT,
  SupervisorCommand,
  SupervisorEvent
} from "@shared/schema";

export type SupervisorClientLogger = {
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
};

const defaultSupervisorClientLogger: SupervisorClientLogger = {
  warn(message, details) {
    console.warn(`[supervisor-client] ${message}`, details);
  },
  error(message, details) {
    console.error(`[supervisor-client] ${message}`, details);
  }
};

export function parseSupervisorEventPayload(
  raw: string,
  logger: SupervisorClientLogger = defaultSupervisorClientLogger
): SupervisorEvent | null {
  try {
    return JSON.parse(raw) as SupervisorEvent;
  } catch (error) {
    logger.warn("invalid-event-payload", {
      error: error instanceof Error ? error.message : String(error),
      raw: raw.slice(0, 200)
    });
    return null;
  }
}

export function notifySupervisorEventListeners(
  listeners: Iterable<(event: SupervisorEvent) => void>,
  event: SupervisorEvent,
  logger: SupervisorClientLogger = defaultSupervisorClientLogger
): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      logger.error("event-listener-failed", {
        error: error instanceof Error ? error.message : String(error),
        eventType: event.type
      });
    }
  }
}

export class SupervisorClient {
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<(event: SupervisorEvent) => void>();

  constructor(private readonly logger: SupervisorClientLogger = defaultSupervisorClientLogger) {}

  async connect(port = DEFAULT_SUPERVISOR_PORT, timeoutMs = 750): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      const timeout = setTimeout(() => {
        socket.removeListener("open", handleOpen);
        socket.removeListener("error", handleError);
        socket.on("error", () => undefined);
        // Timeouts can still race a late connect; terminate so we do not leak an orphaned socket.
        socket.terminate();
        reject(new Error(`Supervisor connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const handleOpen = () => {
        clearTimeout(timeout);
        this.socket = socket;
        socket.on("message", (payload) => {
          const event = parseSupervisorEventPayload(payload.toString(), this.logger);
          if (!event) {
            return;
          }
          notifySupervisorEventListeners(this.listeners, event, this.logger);
        });
        socket.on("close", () => {
          this.socket = null;
        });
        socket.removeListener("error", handleError);
        socket.removeListener("open", handleOpen);
        resolve();
      };
      const handleError = (error: Error) => {
        clearTimeout(timeout);
        socket.removeListener("open", handleOpen);
        socket.removeListener("error", handleError);
        socket.terminate();
        reject(error);
      };

      socket.once("open", handleOpen);
      socket.once("error", handleError);
    });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  onEvent(listener: (event: SupervisorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  send(command: SupervisorCommand): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Supervisor socket is not connected");
    }
    this.socket.send(JSON.stringify(command));
  }
}
