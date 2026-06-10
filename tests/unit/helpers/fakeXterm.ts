export class FakeTerminal {
  static instances: FakeTerminal[] = [];

  element: HTMLElement | null = null;
  options: Record<string, unknown>;
  cols = 0;
  rows = 0;
  writes: string[] = [];
  refreshCalls: Array<[number, number]> = [];
  scrollToBottomCount = 0;
  scrollToLineCalls: number[] = [];
  resetCount = 0;
  focusCount = 0;
  disposed = false;
  selection = "";
  buffer = {
    active: {
      baseY: 0,
      viewportY: 0
    }
  };
  modes: { mouseTrackingMode: "none" | "x10" | "vt200" | "drag" | "any" } = {
    mouseTrackingMode: "none"
  };
  private dataListeners = new Set<(data: string) => void>();
  private selectionListeners = new Set<() => void>();
  private scrollListeners = new Set<(position: number) => void>();

  constructor(options?: unknown) {
    this.options = typeof options === "object" && options ? (options as Record<string, unknown>) : {};
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
    const previousOffsetFromBottom = this.buffer.active.baseY - this.buffer.active.viewportY;
    const lineCount = Math.max(0, data.split(/\r\n|\n|\r/u).length - 1);
    this.buffer.active.baseY += lineCount;
    if (previousOffsetFromBottom === 0) {
      this.buffer.active.viewportY = this.buffer.active.baseY;
      this.emitScroll();
    }
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

  onSelectionChange(listener: () => void): { dispose: () => void } {
    this.selectionListeners.add(listener);
    return {
      dispose: () => {
        this.selectionListeners.delete(listener);
      }
    };
  }

  onScroll(listener: (position: number) => void): { dispose: () => void } {
    this.scrollListeners.add(listener);
    return {
      dispose: () => {
        this.scrollListeners.delete(listener);
      }
    };
  }

  getSelection(): string {
    return this.selection;
  }

  emitSelection(selection: string): void {
    this.selection = selection;
    for (const listener of this.selectionListeners) {
      listener();
    }
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  activateLink(url: string): MouseEvent {
    const MouseEventCtor = this.element?.ownerDocument.defaultView?.MouseEvent ?? globalThis.MouseEvent;
    const event = new MouseEventCtor("click", {
      bubbles: true,
      cancelable: true
    });
    const handler = this.options.linkHandler as { activate?: (event: MouseEvent, text: string) => void } | undefined;
    handler?.activate?.(event, url);
    return event;
  }

  refresh(start: number, end: number): void {
    this.refreshCalls.push([start, end]);
  }

  scrollToBottom(): void {
    this.scrollToBottomCount += 1;
    this.buffer.active.viewportY = this.buffer.active.baseY;
    this.emitScroll();
  }

  scrollToLine(line: number): void {
    this.scrollToLineCalls.push(line);
    this.buffer.active.viewportY = Math.max(0, Math.min(Math.round(line), this.buffer.active.baseY));
    this.emitScroll();
  }

  reset(): void {
    this.resetCount += 1;
    this.buffer.active.baseY = 0;
    this.buffer.active.viewportY = 0;
    this.emitScroll();
  }

  focus(): void {
    this.focusCount += 1;
  }

  dispose(): void {
    this.disposed = true;
  }

  private emitScroll(): void {
    for (const listener of this.scrollListeners) {
      listener(this.buffer.active.viewportY);
    }
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
