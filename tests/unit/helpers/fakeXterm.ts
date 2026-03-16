export class FakeTerminal {
  static instances: FakeTerminal[] = [];

  element: HTMLElement | null = null;
  cols = 0;
  rows = 0;
  writes: string[] = [];
  refreshCalls: Array<[number, number]> = [];
  resetCount = 0;
  focusCount = 0;
  disposed = false;
  private dataListeners = new Set<(data: string) => void>();

  constructor(_options?: unknown) {
    FakeTerminal.instances.push(this);
  }

  loadAddon(addon: { activate?: (terminal: FakeTerminal) => void }): void {
    addon.activate?.(this);
  }

  open(element: HTMLElement): void {
    this.element = element;
  }

  write(data: string, callback?: () => void): void {
    this.writes.push(data);
    callback?.();
  }

  onData(listener: (data: string) => void): { dispose: () => void } {
    this.dataListeners.add(listener);
    return {
      dispose: () => {
        this.dataListeners.delete(listener);
      }
    };
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  refresh(start: number, end: number): void {
    this.refreshCalls.push([start, end]);
  }

  reset(): void {
    this.resetCount += 1;
  }

  focus(): void {
    this.focusCount += 1;
  }

  dispose(): void {
    this.disposed = true;
  }
}

export class FakeFitAddon {
  private terminal: FakeTerminal | null = null;

  activate(terminal: FakeTerminal): void {
    this.terminal = terminal;
  }

  fit(): void {
    if (!this.terminal?.element) {
      return;
    }
    this.terminal.cols = Math.max(1, Math.floor(this.terminal.element.clientWidth / 10));
    this.terminal.rows = Math.max(1, Math.floor(this.terminal.element.clientHeight / 20));
  }
}

export function resetFakeXterm(): void {
  FakeTerminal.instances = [];
}
