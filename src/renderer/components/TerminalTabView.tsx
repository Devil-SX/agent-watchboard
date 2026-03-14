import { useEffect, useRef, useState, type ReactElement } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { reportRendererPerf } from "@renderer/perf";
import {
  containsPrintableTerminalContent,
  getTerminalFallbackText,
  SILENT_SESSION_READY_TIMEOUT_MS,
  shouldShowTerminalFallback,
  shouldAutoHideWaitingFallback,
  type TerminalFallbackPhase
} from "@renderer/components/terminalFallback";
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
  const silentReadyTimerRef = useRef<number | null>(null);
  const dataBufferRef = useRef("");
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const hasVisibleContentRef = useRef(false);
  const sessionStartMeasureRef = useRef<number | null>(null);
  const latencySampleRef = useRef<{ count: number; total: number; max: number }>({
    count: 0,
    total: 0,
    max: 0
  });
  const [localError, setLocalError] = useState<string>("");
  const [fallbackPhase, setFallbackPhase] = useState<TerminalFallbackPhase>("waiting");
  const [hasVisibleContent, setHasVisibleContent] = useState(false);

  const focusTerminal = (): void => {
    terminalRef.current?.focus();
  };

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
    setFallbackPhase("waiting");

    const updateVisibleContent = (nextValue: boolean): void => {
      if (hasVisibleContentRef.current === nextValue) {
        return;
      }
      hasVisibleContentRef.current = nextValue;
      setHasVisibleContent(nextValue);
      if (nextValue) {
        setFallbackPhase("idle");
        void window.watchboard.debugLog("terminal-fallback-hidden", {
          sessionId,
          reason: "visible-content"
        });
      }
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
      xterm.write(chunk, () => {
        updateVisibleContent(true);
        reportRendererPerf({
          category: "terminal",
          name: "first-live-write",
          durationMs: 0,
          sessionId,
          extra: {
            chars: chunk.length
          }
        });
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
      if (!hasVisibleContentRef.current && containsPrintableTerminalContent(normalized)) {
        updateVisibleContentRef.current?.(true);
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
      if (silentReadyTimerRef.current !== null) {
        window.clearTimeout(silentReadyTimerRef.current);
        silentReadyTimerRef.current = null;
      }
      if (fitFrameRef.current !== null) {
        cancelAnimationFrame(fitFrameRef.current);
      }
      if (dataFrameRef.current !== null) {
        cancelAnimationFrame(dataFrameRef.current);
      }
      dataBufferRef.current = "";
      lastResizeRef.current = null;
      updateVisibleContentRef.current = null;
      performFitRef.current = null;
      scheduleFitRef.current = null;
      hasVisibleContentRef.current = false;
      sessionStartMeasureRef.current = null;
      setFallbackPhase("waiting");
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
      focusTerminal();
    });
  }, [isVisible, sessionId]);

  useEffect(() => {
    const xterm = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!xterm || !fitAddon || !session || session.status === "stopped") {
      return;
    }
    if (sessionStartMeasureRef.current !== null) {
      return;
    }
    hasVisibleContentRef.current = false;
    setHasVisibleContent(false);
    setFallbackPhase("waiting");
    setLocalError("");
    xterm.reset();
    lastResizeRef.current = null;
    performFitRef.current?.("session-start", true);
    sessionStartMeasureRef.current = performance.now();
  }, [session?.startedAt, session?.status, sessionId]);

  useEffect(() => {
    if (silentReadyTimerRef.current !== null) {
      window.clearTimeout(silentReadyTimerRef.current);
      silentReadyTimerRef.current = null;
    }
    if (!session || session.status === "stopped") {
      return;
    }
    if (fallbackPhase !== "waiting" || hasVisibleContent || localError) {
      return;
    }
    const startedAt = sessionStartMeasureRef.current ?? performance.now();
    silentReadyTimerRef.current = window.setTimeout(() => {
      const elapsedMs = performance.now() - startedAt;
      if (!shouldAutoHideWaitingFallback(fallbackPhase, hasVisibleContent, localError, session.status, elapsedMs)) {
        return;
      }
      setFallbackPhase("idle");
      sessionStartMeasureRef.current = null;
      reportRendererPerf({
        category: "interaction",
        name: "session-start-silent-ready",
        durationMs: elapsedMs,
        sessionId
      });
      void window.watchboard.debugLog("terminal-fallback-hidden", {
        sessionId,
        reason: "silent-ready-timeout",
        timeoutMs: SILENT_SESSION_READY_TIMEOUT_MS
      });
    }, SILENT_SESSION_READY_TIMEOUT_MS);
    return () => {
      if (silentReadyTimerRef.current !== null) {
        window.clearTimeout(silentReadyTimerRef.current);
        silentReadyTimerRef.current = null;
      }
    };
  }, [fallbackPhase, hasVisibleContent, localError, session, sessionId]);

  const showFallback = shouldShowTerminalFallback(fallbackPhase, hasVisibleContent, localError);
  const fallbackText = getTerminalFallbackText(fallbackPhase);

  return (
    <div className="terminal-pane">
      {localError ? <div className="terminal-error">{localError}</div> : null}
      <div className="terminal-host-shell">
        <div
          ref={hostRef}
          className="terminal-host"
          onMouseDown={() => {
            focusTerminal();
          }}
          onClick={() => {
            focusTerminal();
          }}
        />
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

function normalizeTerminalOutput(data: string): string {
  return data
    .replace(/\u001b\[\?2026[hl]/g, "")
    .replace(/\u001b\[\>7u/g, "")
    .replace(/\u001b\[\?u/g, "")
    .replace(/\u001b\[\?1004[hl]/g, "")
    .replace(/\u001b\[\?2004[hl]/g, "")
    .replace(/\u001b\]0;[^\u0007]*(?:\u0007|\u001b\\)/g, "");
}
