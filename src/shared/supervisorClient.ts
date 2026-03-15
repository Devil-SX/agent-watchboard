import WebSocket from "ws";

import {
  DEFAULT_SUPERVISOR_PORT,
  SupervisorCommand,
  SupervisorEvent
} from "@shared/schema";

export class SupervisorClient {
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<(event: SupervisorEvent) => void>();

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
        reject(new Error(`Supervisor connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const handleOpen = () => {
        clearTimeout(timeout);
        this.socket = socket;
        socket.on("message", (payload) => {
          const event = JSON.parse(payload.toString()) as SupervisorEvent;
          for (const listener of this.listeners) {
            listener(event);
          }
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
