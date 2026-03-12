import { FileLogger } from "@shared/fileLogger";
import { type PerfEvent, serializePerfEvent } from "@shared/perf";

export class PerfRecorder {
  private readonly logger: FileLogger;

  constructor(filePath: string, name: string) {
    this.logger = new FileLogger({
      filePath,
      name,
      append: true
    });
  }

  record(event: PerfEvent): void {
    this.logger.raw(serializePerfEvent(event));
  }

  close(): void {
    this.logger.close();
  }
}
