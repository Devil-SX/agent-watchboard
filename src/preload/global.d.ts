import type { WatchboardApi } from "@shared/ipc";

declare global {
  interface Window {
    watchboard: WatchboardApi;
  }
}

export {};
