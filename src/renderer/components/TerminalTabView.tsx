import { useEffect, useRef, useState, type ReactElement } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { reportRendererPerf } from "@renderer/perf";
import { type AppSettings, type SessionState, type TerminalInstance } from "@shared/schema";

type Props = {
  instance: TerminalInstance;
  session: SessionState | null;
  settings: AppSettings;
  isVisible: boolean;
};

export function TerminalTabView({ instance, session, settings, isVisible }: Props): ReactElement {
  const terminal = instance.terminalProfileSnapshot;
  const sessionId = instance.sessionId;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const updateVisibleContentRef = useRef<((nextValue: boolean) => void) | null>(null);
  const performFitRef = useRef<((reason: string, shouldResize: boolean) => void) | null>(null);
  const scheduleFitRef = useRef<((reason: string, shouldResize?: boolean) => void) | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const fitShouldResizeRef = useRef(false);
  const fitReasonsRef = useRef<string[]>([]);
  const dataFrameRef = useRef<number | null>(null);
  const dataBufferRef = useRef("");
  const backlogKeyRef = useRef<string>("");
  const hydratingRef = useRef(false);
  const pendingDataRef = useRef<string[]>([]);
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const plainPreviewRef = useRef("");
  const hasVisibleContentRef = useRef(false);
  const sessionStartMeasureRef = useRef<number | null>(null);
  const latencySampleRef = useRef<{ count: number; total: number; max: number }>({
    count: 0,
    total: 0,
    max: 0
  });
  const [localError, setLocalError] = useState<string>("");
  const [fallbackText, setFallbackText] = useState<string>("");
  const [hasVisibleContent, setHasVisibleContent] = useState(false);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }
    const host = hostRef.current;

    const xterm = new Terminal({
      cursorBlink: true,
      fontFamily: settings.terminalFontFamily,
      fontSize: settings.terminalFontSize,
      lineHeight: 1.15,
      scrollback: 5000,
      allowTransparency: false,
      customGlyphs: false,
      minimumContrastRatio: 1,
      rescaleOverlappingGlyphs: false,
      theme: {
        background: "#071118",
        foreground: "#d7e0e6",
        cursor: "#f5c26b",
        black: "#0d171f",
        red: "#ff7a7a",
        green: "#73d4a6",
        yellow: "#f5c26b",
        blue: "#75b6ff",
        magenta: "#d5a8ff",
        cyan: "#68d5d7",
        white: "#eef4f8",
        brightBlack: "#39505c",
        brightRed: "#ff9b9b",
        brightGreen: "#8ce0b0",
        brightYellow: "#f8d786",
        brightBlue: "#8fc5ff",
        brightMagenta: "#e0bcff",
        brightCyan: "#8be4e6",
        brightWhite: "#ffffff"
      }
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(host);
    setFallbackText("[watchboard] terminal ready, waiting for session output...");

    const updateVisibleContent = (nextValue: boolean): void => {
      if (hasVisibleContentRef.current === nextValue) {
        return;
      }
      hasVisibleContentRef.current = nextValue;
      setHasVisibleContent(nextValue);
      if (nextValue && sessionStartMeasureRef.current !== null) {
        reportRendererPerf({
          category: "interaction",
          name: "session-start-visible",
          durationMs: performance.now() - sessionStartMeasureRef.current,
          sessionId
        });
        sessionStartMeasureRef.current = null;
      }
    };
    updateVisibleContentRef.current = updateVisibleContent;
    const sendResizeIfNeeded = (force = false): void => {
      const nextSize = { cols: xterm.cols, rows: xterm.rows };
      const lastSize = lastResizeRef.current;
      if (!force && lastSize && lastSize.cols === nextSize.cols && lastSize.rows === nextSize.rows) {
        return;
      }
      lastResizeRef.current = nextSize;
      void window.watchboard.resizeSession(sessionId, nextSize.cols, nextSize.rows);
    };
    const performFit = (reason: string, shouldResize: boolean): void => {
      const fitStartedAt = performance.now();
      fitAddon.fit();
      reportRendererPerf({
        category: "terminal",
        name: "fit",
        durationMs: performance.now() - fitStartedAt,
        sessionId,
        extra: {
          reason
        }
      });
      if (shouldResize) {
        sendResizeIfNeeded();
      }
    };
    const scheduleFit = (reason: string, shouldResize = true): void => {
      fitReasonsRef.current.push(reason);
      fitShouldResizeRef.current = fitShouldResizeRef.current || shouldResize;
      if (fitFrameRef.current !== null) {
        return;
      }
      fitFrameRef.current = requestAnimationFrame(() => {
        fitFrameRef.current = null;
        const reasons = fitReasonsRef.current.splice(0, fitReasonsRef.current.length);
        const nextShouldResize = fitShouldResizeRef.current;
        fitShouldResizeRef.current = false;
        performFit(reasons.join(","), nextShouldResize);
      });
    };
    const flushTerminalOutput = (): void => {
      dataFrameRef.current = null;
      const chunk = dataBufferRef.current;
      if (!chunk) {
        return;
      }
      dataBufferRef.current = "";
      const hasPrintableContent = containsPrintableContent(chunk);
      xterm.write(chunk, () => {
        if (hasPrintableContent) {
          updateVisibleContent(true);
        }
      });
    };
    const scheduleOutputFlush = (): void => {
      if (dataFrameRef.current !== null) {
        return;
      }
      dataFrameRef.current = requestAnimationFrame(() => {
        flushTerminalOutput();
      });
    };
    const flushLatencySample = (): void => {
      const sample = latencySampleRef.current;
      if (sample.count === 0) {
        return;
      }
      reportRendererPerf({
        category: "terminal",
        name: "session-data-latency",
        durationMs: sample.total / sample.count,
        sessionId,
        extra: {
          count: sample.count,
          maxMs: sample.max
        }
      });
      latencySampleRef.current = { count: 0, total: 0, max: 0 };
    };
    performFitRef.current = performFit;
    scheduleFitRef.current = scheduleFit;
    void waitForHostReady(host)
      .then(() => {
        performFit("host-ready", false);
      })
      .catch(() => undefined);

    const handleTerminalData = (event: Event): void => {
      const detail = (event as CustomEvent<{ sessionId: string; data: string; emittedAt: number }>).detail;
      if (detail.sessionId !== sessionId) {
        return;
      }
      const latency = Date.now() - detail.emittedAt;
      latencySampleRef.current = {
        count: latencySampleRef.current.count + 1,
        total: latencySampleRef.current.total + latency,
        max: Math.max(latencySampleRef.current.max, latency)
      };
      if (latencySampleRef.current.count >= 12) {
        flushLatencySample();
      }
      const normalized = normalizeTerminalOutput(detail.data);
      if (!normalized) {
        return;
      }
      if (!hasVisibleContentRef.current) {
        updatePlainPreview(normalized, plainPreviewRef, setFallbackText);
      }
      if (hydratingRef.current) {
        pendingDataRef.current.push(normalized);
        return;
      }
      dataBufferRef.current += normalized;
      scheduleOutputFlush();
    };

    xterm.onData((data) => {
      window.watchboard.writeToSession(sessionId, data, Date.now());
    });
    window.addEventListener("watchboard:terminal-data", handleTerminalData);

    const observer = new ResizeObserver(() => {
      scheduleFit("resize-observer");
    });
    observer.observe(host);

    terminalRef.current = xterm;
    fitAddonRef.current = fitAddon;

    if (session && session.status !== "stopped") {
      sendResizeIfNeeded(true);
    }

    return () => {
      flushLatencySample();
      if (fitFrameRef.current !== null) {
        cancelAnimationFrame(fitFrameRef.current);
      }
      if (dataFrameRef.current !== null) {
        cancelAnimationFrame(dataFrameRef.current);
      }
      dataBufferRef.current = "";
      hydratingRef.current = false;
      pendingDataRef.current = [];
      lastResizeRef.current = null;
      updateVisibleContentRef.current = null;
      performFitRef.current = null;
      scheduleFitRef.current = null;
      plainPreviewRef.current = "";
      hasVisibleContentRef.current = false;
      sessionStartMeasureRef.current = null;
      setFallbackText("");
      setHasVisibleContent(false);
      observer.disconnect();
      window.removeEventListener("watchboard:terminal-data", handleTerminalData);
      terminalRef.current = null;
      fitAddonRef.current = null;
      xterm.dispose();
    };
  }, [sessionId]);

  useEffect(() => {
    const xterm = terminalRef.current;
    if (!xterm || !session || session.status === "stopped") {
      return;
    }
    const nextSize = { cols: xterm.cols, rows: xterm.rows };
    const lastSize = lastResizeRef.current;
    if (!lastSize || lastSize.cols !== nextSize.cols || lastSize.rows !== nextSize.rows) {
      lastResizeRef.current = nextSize;
      void window.watchboard.resizeSession(sessionId, nextSize.cols, nextSize.rows);
    }
  }, [session?.status, sessionId]);

  useEffect(() => {
    const xterm = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!xterm || !fitAddon) {
      return;
    }
    xterm.options.fontFamily = settings.terminalFontFamily;
    xterm.options.fontSize = settings.terminalFontSize;
    scheduleFitRef.current?.("font-settings");
  }, [sessionId, settings.terminalFontFamily, settings.terminalFontSize]);

  useEffect(() => {
    const xterm = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!xterm || !fitAddon || !isVisible) {
      return;
    }
    void waitForNextPaint().then(() => {
      scheduleFitRef.current?.("tab-visible");
    });
  }, [isVisible, sessionId]);

  useEffect(() => {
    const xterm = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!xterm || !fitAddon || !session || session.status === "stopped") {
      hydratingRef.current = false;
      return;
    }
    const backlogKey = `${sessionId}:${session.startedAt}`;
    if (backlogKeyRef.current === backlogKey) {
      return;
    }
    backlogKeyRef.current = backlogKey;
    hydratingRef.current = true;
    pendingDataRef.current = [];
    plainPreviewRef.current = "";
    hasVisibleContentRef.current = false;
    setHasVisibleContent(false);
    setFallbackText("[watchboard] hydrating terminal backlog...");
    let cancelled = false;
    const backlogReadStartedAt = performance.now();
    void window.watchboard.debugLog("terminal-hydrate-start", {
      sessionId,
      backlogKey
    });
    void window.watchboard
      .readSessionBacklog(sessionId)
      .then(async (backlog) => {
        await waitForHostReady(hostRef.current);
        await waitForNextPaint();
        if (cancelled || terminalRef.current !== xterm) {
          return;
        }
        const normalizedBacklog = normalizeTerminalOutput(backlog);
        updatePlainPreview(normalizedBacklog, plainPreviewRef, setFallbackText);
        void window.watchboard.debugLog("terminal-hydrate-backlog", {
          sessionId,
          chars: backlog.length,
          normalizedChars: normalizedBacklog.length
        });
        reportRendererPerf({
          category: "terminal",
          name: "backlog-read",
          durationMs: performance.now() - backlogReadStartedAt,
          sessionId,
          extra: {
            chars: backlog.length
          }
        });
        xterm.reset();
        lastResizeRef.current = null;
        const backlogWriteStartedAt = performance.now();
        if (normalizedBacklog) {
          await writeBuffered(xterm, normalizedBacklog);
        }
        const pending = pendingDataRef.current.join("");
        pendingDataRef.current = [];
        if (pending) {
          updatePlainPreview(pending, plainPreviewRef, setFallbackText);
          await writeBuffered(xterm, pending);
        }
        reportRendererPerf({
          category: "terminal",
          name: "backlog-write",
          durationMs: performance.now() - backlogWriteStartedAt,
          sessionId,
          extra: {
            chars: normalizedBacklog.length + pending.length
          }
        });
        hydratingRef.current = false;
        performFitRef.current?.("hydrate-done", true);
        updateVisibleContentRef.current?.(containsPrintableContent(normalizedBacklog) || containsPrintableContent(pending));
        void window.watchboard.debugLog("terminal-hydrate-done", {
          sessionId,
          pendingChars: pending.length,
          cols: xterm.cols,
          rows: xterm.rows
        });
      })
      .catch((error) => {
        hydratingRef.current = false;
        void window.watchboard.debugLog("terminal-hydrate-error", {
          sessionId,
          message: error instanceof Error ? error.message : String(error)
        });
        setLocalError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
      hydratingRef.current = false;
      pendingDataRef.current = [];
    };
  }, [session?.startedAt, session?.status, sessionId]);
  const showFallback = Boolean(fallbackText && !hasVisibleContent);

  return (
    <div className="terminal-pane">
      {localError ? <div className="terminal-error">{localError}</div> : null}
      <div className="terminal-host-shell">
        <div ref={hostRef} className="terminal-host" />
        {showFallback ? <pre className="terminal-fallback">{fallbackText}</pre> : null}
      </div>
    </div>
  );
}

async function waitForNextPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 30);
    });
  });
}

async function waitForHostReady(host: HTMLDivElement | null): Promise<void> {
  if (!host) {
    return;
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (host.clientWidth > 0 && host.clientHeight > 0 && host.isConnected) {
      return;
    }
    await waitForNextPaint();
  }
}

async function writeBuffered(xterm: Terminal, data: string): Promise<void> {
  const chunkSize = 16_384;
  for (let index = 0; index < data.length; index += chunkSize) {
    const chunk = data.slice(index, index + chunkSize);
    await new Promise<void>((resolve) => {
      xterm.write(chunk, () => resolve());
    });
  }
}

function normalizeTerminalOutput(data: string): string {
  return data
    .replace(/\u001b\[\?2026[hl]/g, "")
    .replace(/\u001b\[\>7u/g, "")
    .replace(/\u001b\[\?u/g, "")
    .replace(/\u001b\[\?1004[hl]/g, "")
    .replace(/\u001b\[\?2004[hl]/g, "")
    .replace(/\u001b\]0;[^\u0007]*(?:\u0007|\u001b\\)/g, "");
}

function updatePlainPreview(
  data: string,
  previewRef: { current: string },
  setFallback: (value: string) => void
): void {
  const plain = toPlainTerminalPreview(data);
  if (!plain) {
    return;
  }
  previewRef.current = `${previewRef.current}${plain}`.slice(-12_000);
  setFallback(previewRef.current);
}

function toPlainTerminalPreview(data: string): string {
  return data
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b[\(\)][A-Za-z0-9]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimStart();
}

function containsPrintableContent(data: string): boolean {
  return toPlainTerminalPreview(data).trim().length > 0;
}
