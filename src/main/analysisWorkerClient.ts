import { Worker } from "node:worker_threads";

import type { AnalysisPerfStage } from "@main/analysisDatabase";
import type {
  AnalysisWorkerLogEvent,
  AnalysisWorkerRequest,
  AnalysisWorkerRequestWithoutId,
  AnalysisWorkerResponse,
  AnalysisWorkerResult
} from "@main/analysisWorkerProtocol";

type AnalysisWorkerLike = {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  postMessage: (request: AnalysisWorkerRequest) => void;
  terminate: () => Promise<number>;
};

type AnalysisWorkerClientOptions = {
  createWorker?: () => AnalysisWorkerLike;
  onPerfEvent?: (event: AnalysisPerfStage) => void;
  onLogEvent?: (event: AnalysisWorkerLogEvent) => void;
};

type PendingRequest = {
  resolve: (result: AnalysisWorkerResult) => void;
  reject: (error: Error) => void;
};

export class AnalysisWorkerClient {
  private worker: AnalysisWorkerLike | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private nextRequestId = 0;
  private readonly createWorker: () => AnalysisWorkerLike;
  private readonly onPerfEvent?: (event: AnalysisPerfStage) => void;
  private readonly onLogEvent?: (event: AnalysisWorkerLogEvent) => void;

  constructor(options: AnalysisWorkerClientOptions = {}) {
    this.createWorker = options.createWorker ?? createDefaultAnalysisWorker;
    this.onPerfEvent = options.onPerfEvent;
    this.onLogEvent = options.onLogEvent;
  }

  async run(request: AnalysisWorkerRequestWithoutId): Promise<AnalysisWorkerResult> {
    const worker = this.ensureWorker();
    const id = `analysis-${this.nextRequestId}`;
    this.nextRequestId += 1;

    return await new Promise<AnalysisWorkerResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({
        ...request,
        id
      });
    });
  }

  async terminate(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (!worker) {
      return;
    }
    const pendingError = new Error("Analysis worker was terminated before completing the request.");
    this.rejectPendingRequests(pendingError);
    await worker.terminate();
  }

  private ensureWorker(): AnalysisWorkerLike {
    if (this.worker) {
      return this.worker;
    }

    const worker = this.createWorker();
    worker.on("message", (response) => {
      this.handleResponse(response as AnalysisWorkerResponse);
    });
    worker.on("error", (error) => {
      this.worker = null;
      this.rejectPendingRequests(error as Error);
    });
    worker.on("exit", (code) => {
      this.worker = null;
      if (typeof code === "number" && code !== 0) {
        this.rejectPendingRequests(new Error(`Analysis worker exited with code ${code}.`));
      }
    });
    this.worker = worker;
    return worker;
  }

  private handleResponse(response: AnalysisWorkerResponse): void {
    for (const event of response.logEvents) {
      this.onLogEvent?.(event);
    }
    for (const event of response.perfEvents) {
      this.onPerfEvent?.(event);
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    this.pending.delete(response.id);

    if (response.ok) {
      pending.resolve(response.result);
      return;
    }

    const error = new Error(response.error.message);
    if (response.error.stack) {
      error.stack = response.error.stack;
    }
    pending.reject(error);
  }

  private rejectPendingRequests(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function createDefaultAnalysisWorker(): AnalysisWorkerLike {
  // Analysis reads use synchronous SQLite APIs. Keep them off the Electron main
  // thread so loading a large profiler database does not freeze the whole UI.
  return new Worker(new URL("./analysisWorker.js", import.meta.url), {
  });
}
