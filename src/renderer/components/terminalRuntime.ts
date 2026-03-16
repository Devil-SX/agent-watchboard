import FitAddonModule from "@xterm/addon-fit";
import XtermModule from "@xterm/xterm";

const TerminalCtor = (XtermModule as unknown as { Terminal?: new (...args: unknown[]) => unknown }).Terminal
  ?? (XtermModule as unknown as new (...args: unknown[]) => unknown);
const FitAddonCtor = (FitAddonModule as unknown as { FitAddon?: new (...args: unknown[]) => unknown }).FitAddon
  ?? (FitAddonModule as unknown as new (...args: unknown[]) => unknown);

type TerminalRuntimeFactory = {
  createTerminal: (options: unknown) => unknown;
  createFitAddon: () => unknown;
};

let runtimeFactory: TerminalRuntimeFactory = {
  createTerminal: (options) => new TerminalCtor(options),
  createFitAddon: () => new FitAddonCtor()
};

export function createTerminalRuntime(options: unknown): {
  terminal: {
    loadAddon: (addon: unknown) => void;
    open: (host: HTMLElement) => void;
    write: (data: string, callback?: () => void) => void;
    onData: (listener: (data: string) => void) => unknown;
    refresh: (start: number, end: number) => void;
    reset: () => void;
    focus: () => void;
    dispose: () => void;
    element: HTMLElement | null;
    cols: number;
    rows: number;
  };
  fitAddon: {
    fit: () => void;
  };
} {
  return {
    terminal: runtimeFactory.createTerminal(options) as {
      loadAddon: (addon: unknown) => void;
      open: (host: HTMLElement) => void;
      write: (data: string, callback?: () => void) => void;
      onData: (listener: (data: string) => void) => unknown;
      refresh: (start: number, end: number) => void;
      reset: () => void;
      focus: () => void;
      dispose: () => void;
      element: HTMLElement | null;
      cols: number;
      rows: number;
    },
    fitAddon: runtimeFactory.createFitAddon() as {
      fit: () => void;
    }
  };
}

export function configureTerminalRuntimeForTests(factory: TerminalRuntimeFactory | null): void {
  runtimeFactory = factory ?? {
    createTerminal: (options) => new TerminalCtor(options),
    createFitAddon: () => new FitAddonCtor()
  };
}
