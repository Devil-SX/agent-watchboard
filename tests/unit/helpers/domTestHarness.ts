import { JSDOM } from "jsdom";

type TimerRecord = {
  id: number;
  dueAt: number;
  callback: () => void;
};

type ResizeObserverInstance = {
  callback: ResizeObserverCallback;
  elements: Set<Element>;
};

export type DomTestHarness = {
  window: Window & typeof globalThis;
  document: Document;
  setElementSize: (element: Element, width: number, height: number) => void;
  advanceTimers: (ms: number) => void;
  flushRaf: () => void;
  flushNextPaint: () => void;
  triggerResize: (element?: Element) => void;
  cleanup: () => void;
};

export function createDomTestHarness(): DomTestHarness {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/"
  });
  const { window } = dom;
  const { document } = window;

  const previousGlobals = captureGlobals();

  let nowMs = 0;
  let nextTimerId = 1;
  let nextRafId = 1;
  let rafQueue: Array<{ id: number; callback: FrameRequestCallback }> = [];
  const timers = new Map<number, TimerRecord>();
  const resizeObserverInstances = new Set<ResizeObserverInstance>();
  const sizeMap = new WeakMap<Element, { width: number; height: number }>();

  class FakeResizeObserver implements ResizeObserver {
    private readonly instance: ResizeObserverInstance;

    constructor(callback: ResizeObserverCallback) {
      this.instance = {
        callback,
        elements: new Set()
      };
      resizeObserverInstances.add(this.instance);
    }

    observe(target: Element): void {
      this.instance.elements.add(target);
    }

    unobserve(target: Element): void {
      this.instance.elements.delete(target);
    }

    disconnect(): void {
      this.instance.elements.clear();
      resizeObserverInstances.delete(this.instance);
    }
  }

  const fakeSetTimeout = (callback: TimerHandler, delay = 0): number => {
    const id = nextTimerId++;
    timers.set(id, {
      id,
      dueAt: nowMs + Number(delay),
      callback: typeof callback === "function" ? callback : () => undefined
    });
    return id;
  };

  const fakeClearTimeout = (id: number): void => {
    timers.delete(id);
  };

  const fakeRequestAnimationFrame = (callback: FrameRequestCallback): number => {
    const id = nextRafId++;
    rafQueue.push({ id, callback });
    return id;
  };

  const fakeCancelAnimationFrame = (id: number): void => {
    rafQueue = rafQueue.filter((entry) => entry.id !== id);
  };

  assignGlobals(window, document, {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    requestAnimationFrame: fakeRequestAnimationFrame,
    cancelAnimationFrame: fakeCancelAnimationFrame,
    ResizeObserver: FakeResizeObserver
  });

  const setElementSize = (element: Element, width: number, height: number): void => {
    sizeMap.set(element, { width, height });
    const host = element as HTMLElement;
    defineSizeProperty(host, "clientWidth", () => sizeMap.get(element)?.width ?? 0);
    defineSizeProperty(host, "clientHeight", () => sizeMap.get(element)?.height ?? 0);
  };

  const flushRaf = (): void => {
    const callbacks = rafQueue.splice(0, rafQueue.length);
    for (const entry of callbacks) {
      entry.callback(nowMs);
    }
  };

  const advanceTimers = (ms: number): void => {
    nowMs += ms;
    while (true) {
      const dueTimers = [...timers.values()]
        .filter((record) => record.dueAt <= nowMs)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id);
      if (dueTimers.length === 0) {
        break;
      }
      for (const record of dueTimers) {
        timers.delete(record.id);
        record.callback();
      }
    }
  };

  const flushNextPaint = (): void => {
    flushRaf();
    advanceTimers(30);
  };

  const triggerResize = (element?: Element): void => {
    for (const instance of resizeObserverInstances) {
      const targets = element
        ? [...instance.elements].filter((entry) => entry === element)
        : [...instance.elements];
      if (targets.length === 0) {
        continue;
      }
      instance.callback(
        targets.map((target) => ({
          target,
          contentRect: {
            width: sizeMap.get(target)?.width ?? 0,
            height: sizeMap.get(target)?.height ?? 0
          }
        })) as ResizeObserverEntry[],
        {} as ResizeObserver
      );
    }
  };

  return {
    window,
    document,
    setElementSize,
    advanceTimers,
    flushRaf,
    flushNextPaint,
    triggerResize,
    cleanup: () => {
      restoreGlobals(previousGlobals);
      dom.window.close();
    }
  };
}

function defineSizeProperty(target: HTMLElement, key: "clientWidth" | "clientHeight", getter: () => number): void {
  Object.defineProperty(target, key, {
    configurable: true,
    get: getter
  });
}

function captureGlobals(): Record<string, unknown> {
  return {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    ResizeObserver: (globalThis as Record<string, unknown>).ResizeObserver,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame
  };
}

function assignGlobals(
  window: Window & typeof globalThis,
  document: Document,
  overrides: {
    setTimeout: typeof globalThis.setTimeout;
    clearTimeout: typeof globalThis.clearTimeout;
    requestAnimationFrame: typeof globalThis.requestAnimationFrame;
    cancelAnimationFrame: typeof globalThis.cancelAnimationFrame;
    ResizeObserver: typeof ResizeObserver;
  }
): void {
  defineGlobalValue("window", window);
  defineGlobalValue("document", document);
  defineGlobalValue("navigator", window.navigator);
  defineGlobalValue("HTMLElement", window.HTMLElement);
  defineGlobalValue("Element", window.Element);
  defineGlobalValue("Node", window.Node);
  defineGlobalValue("Event", window.Event);
  defineGlobalValue("CustomEvent", window.CustomEvent);
  defineGlobalValue("ResizeObserver", overrides.ResizeObserver);
  defineGlobalValue("setTimeout", overrides.setTimeout);
  defineGlobalValue("clearTimeout", overrides.clearTimeout);
  defineGlobalValue("requestAnimationFrame", overrides.requestAnimationFrame);
  defineGlobalValue("cancelAnimationFrame", overrides.cancelAnimationFrame);
  window.setTimeout = overrides.setTimeout;
  window.clearTimeout = overrides.clearTimeout;
  window.requestAnimationFrame = overrides.requestAnimationFrame;
  window.cancelAnimationFrame = overrides.cancelAnimationFrame;
  (window as Record<string, unknown>).ResizeObserver = overrides.ResizeObserver;
}

function restoreGlobals(previous: Record<string, unknown>): void {
  defineGlobalValue("window", previous.window);
  defineGlobalValue("document", previous.document);
  defineGlobalValue("navigator", previous.navigator);
  defineGlobalValue("HTMLElement", previous.HTMLElement);
  defineGlobalValue("Element", previous.Element);
  defineGlobalValue("Node", previous.Node);
  defineGlobalValue("Event", previous.Event);
  defineGlobalValue("CustomEvent", previous.CustomEvent);
  defineGlobalValue("ResizeObserver", previous.ResizeObserver);
  defineGlobalValue("setTimeout", previous.setTimeout);
  defineGlobalValue("clearTimeout", previous.clearTimeout);
  defineGlobalValue("requestAnimationFrame", previous.requestAnimationFrame);
  defineGlobalValue("cancelAnimationFrame", previous.cancelAnimationFrame);
}

function defineGlobalValue(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value
  });
}
