import WebSocket from "ws";

import {
  DEFAULT_SUPERVISOR_PORT,
  SupervisorCommand,
  SupervisorEvent
} from "@shared/schema";

export class SupervisorClient {
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<(event: SupervisorEvent) => void>();

  async connect(port = DEFAULT_SUPERVISOR_PORT): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      const handleOpen = () => {
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
        resolve();
      };
      const handleError = (error: Error) => {
        socket.removeListener("open", handleOpen);
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
