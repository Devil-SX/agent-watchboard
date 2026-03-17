import { useEffect, useRef, useState, type ReactElement } from "react";

import { reportRendererPerf } from "@renderer/perf";
import {
  hasMeaningfulTerminalSizeChange,
  isTerminalHostMeasurable,
  resolveTerminalRedrawNudgeGeometry,
  shouldCommitTerminalResize,
  TERMINAL_RESIZE_SETTLE_MS,
  type TerminalGeometry,
  type TerminalHostSize
} from "@renderer/components/terminalResizePolicy";
import {
  containsPrintableTerminalContent,
  getTerminalFallbackText,
  SILENT_SESSION_READY_TIMEOUT_MS,
  shouldShowTerminalFallback,
  type TerminalFallbackPhase
} from "@renderer/components/terminalFallback";
import {
  normalizeTerminalOutput,
  resolveSilentTerminalRecoveryDecision,
  resolveTerminalBacklogReplayDecision
} from "@renderer/components/terminalRecoveryPolicy";
import { createTerminalRuntime } from "@renderer/components/terminalRuntime";
import { resolveTerminalSessionLifecycle } from "@renderer/components/terminalSessionLifecycle";
import { createTerminalViewState, type TerminalViewState } from "@renderer/components/terminalViewState";
import { type AppSettings, type SessionState, type TerminalInstance } from "@shared/schema";

type Props = {
  instance: TerminalInstance;
  session: SessionState | null;
  settings: AppSettings;
  isVisible: boolean;
  sessionBacklog?: string;
  terminalViewState?: TerminalViewState | null;
  attachSessionBacklog: (sessionId: string) => Promise<string>;
  onTerminalViewStateChange: (sessionId: string, state: TerminalViewState) => void;
};

export function TerminalTabView({
  instance,
  session,
  settings,
  isVisible,
  sessionBacklog = "",
  terminalViewState = null,
  attachSessionBacklog,
  onTerminalViewStateChange
}: Props): ReactElement {
  const sessionId = instance.sessionId;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<ReturnType<typeof createTerminalRuntime>["terminal"] | null>(null);
  const fitAddonRef = useRef<ReturnType<typeof createTerminalRuntime>["fitAddon"] | null>(null);
  const updateVisibleContentRef = useRef<((nextValue: boolean) => void) | null>(null);
  const performFitRef = useRef<((reason: string) => boolean) | null>(null);
  const scheduleFitRef = useRef<((reason: string) => void) | null>(null);
  const scheduleCommittedResizeRef = useRef<((reason: string, delayMs?: number) => void) | null>(null);
  const requestTerminalRedrawRef = useRef<((reason: string) => boolean) | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const fitReasonsRef = useRef<string[]>([]);
  const resizeSettleTimerRef = useRef<number | null>(null);
  const dataFrameRef = useRef<number | null>(null);
  const silentReadyTimerRef = useRef<number | null>(null);
  const redrawRestoreTimerRef = useRef<number | null>(null);
  const dataBufferRef = useRef("");
  const lastCommittedGeometryRef = useRef<TerminalGeometry | null>(null);
  const lastObservedHostSizeRef = useRef<TerminalHostSize | null>(null);
  const hasVisibleContentRef = useRef(false);
  const sessionStartMeasureRef = useRef<number | null>(null);
  const latencySampleRef = useRef<{ count: number; total: number; max: number }>({
    count: 0,
    total: 0,
    max: 0
  });
  const lastStartedAtRef = useRef<string | null>(null);
  const sessionBacklogRef = useRef(sessionBacklog);
  const redrawNudgeAttemptedRef = useRef(false);
  const fallbackPhaseRef = useRef<TerminalFallbackPhase>(terminalViewState?.fallbackPhase ?? "waiting");
  const [localError, setLocalError] = useState<string>("");
  const [fallbackPhase, setFallbackPhase] = useState<TerminalFallbackPhase>(terminalViewState?.fallbackPhase ?? "waiting");
  const [hasVisibleContent, setHasVisibleContent] = useState(terminalViewState?.hasVisibleContent ?? false);
  sessionBacklogRef.current = sessionBacklog;
  hasVisibleContentRef.current = terminalViewState?.hasVisibleContent ?? hasVisibleContentRef.current;
  fallbackPhaseRef.current = fallbackPhase;

  const focusTerminal = (): void => {
    terminalRef.current?.focus();
  };

  useEffect(() => {
    if (!terminalViewState) {
      return;
    }
    hasVisibleContentRef.current = terminalViewState.hasVisibleContent;
    fallbackPhaseRef.current = terminalViewState.fallbackPhase;
    setHasVisibleContent(terminalViewState.hasVisibleContent);
    setFallbackPhase(terminalViewState.fallbackPhase);
  }, [terminalViewState]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }
    const host = hostRef.current;

    const { terminal: xterm, fitAddon } = createTerminalRuntime({
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
    xterm.loadAddon(fitAddon);
    xterm.open(host);

    const readHostSize = (): TerminalHostSize => ({
      width: host.clientWidth,
      height: host.clientHeight
    });

    const updateFallbackPhase = (nextPhase: TerminalFallbackPhase): void => {
      if (fallbackPhaseRef.current === nextPhase) {
        return;
      }
      fallbackPhaseRef.current = nextPhase;
      setFallbackPhase(nextPhase);
    };

    const updateVisibleContent = (nextValue: boolean): void => {
      if (hasVisibleContentRef.current === nextValue) {
        return;
      }
      hasVisibleContentRef.current = nextValue;
      setHasVisibleContent(nextValue);
      if (nextValue) {
        updateFallbackPhase("idle");
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

    const sendCommittedResizeIfNeeded = (reason: string): void => {
      const nextGeometry = { cols: xterm.cols, rows: xterm.rows };
      if (!shouldCommitTerminalResize(lastCommittedGeometryRef.current, nextGeometry)) {
        reportRendererPerf({
          category: "terminal",
          name: "resize-commit-skipped",
          durationMs: 0,
          sessionId,
          extra: {
            reason,
            cols: nextGeometry.cols,
            rows: nextGeometry.rows
          }
        });
        return;
      }
      lastCommittedGeometryRef.current = nextGeometry;
      reportRendererPerf({
        category: "terminal",
        name: "resize-settle",
        durationMs: 0,
        sessionId,
        extra: {
          reason,
          cols: nextGeometry.cols,
          rows: nextGeometry.rows
        }
      });
      void window.watchboard.resizeSession(sessionId, nextGeometry.cols, nextGeometry.rows);
    };

    const performFit = (reason: string): boolean => {
      const hostSize = readHostSize();
      if (!host.isConnected || !isTerminalHostMeasurable(hostSize)) {
        reportRendererPerf({
          category: "terminal",
          name: "resize-commit-skipped",
          durationMs: 0,
          sessionId,
          extra: {
            reason,
            width: hostSize.width,
            height: hostSize.height
          }
        });
        return false;
      }
      const fitStartedAt = performance.now();
      fitAddon.fit();
      reportRendererPerf({
        category: "terminal",
        name: reason.startsWith("commit:") ? "fit-commit" : "fit-local",
        durationMs: performance.now() - fitStartedAt,
        sessionId,
        extra: {
          reason
        }
      });
      return true;
    };

    const scheduleCommittedResize = (reason: string, delayMs = TERMINAL_RESIZE_SETTLE_MS): void => {
      if (resizeSettleTimerRef.current !== null) {
        window.clearTimeout(resizeSettleTimerRef.current);
      }
      resizeSettleTimerRef.current = window.setTimeout(() => {
        resizeSettleTimerRef.current = null;
        if (!performFit(`commit:${reason}`)) {
          return;
        }
        sendCommittedResizeIfNeeded(reason);
      }, delayMs);
    };

    const scheduleFit = (reason: string): void => {
      fitReasonsRef.current.push(reason);
      if (fitFrameRef.current !== null) {
        return;
      }
      fitFrameRef.current = requestAnimationFrame(() => {
        fitFrameRef.current = null;
        const reasons = fitReasonsRef.current.splice(0, fitReasonsRef.current.length);
        void performFit(reasons.join(","));
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

    updateVisibleContentRef.current = updateVisibleContent;
    performFitRef.current = performFit;
    scheduleFitRef.current = scheduleFit;
    scheduleCommittedResizeRef.current = scheduleCommittedResize;

    const requestTerminalRedraw = (reason: string): boolean => {
      const decision = resolveSilentTerminalRecoveryDecision({
        phase: "waiting",
        hasVisibleContent: false,
        localError: "",
        sessionStatus: session?.status,
        elapsedMs: SILENT_SESSION_READY_TIMEOUT_MS,
        redrawAlreadyAttempted: redrawNudgeAttemptedRef.current,
        geometry: lastCommittedGeometryRef.current ?? { cols: xterm.cols, rows: xterm.rows }
      });
      if (decision.kind !== "redraw-nudge") {
        return false;
      }
      redrawNudgeAttemptedRef.current = true;
      reportRendererPerf({
        category: "terminal",
        name: "redraw-nudge",
        durationMs: 0,
        sessionId,
        extra: {
          reason,
          fromCols: decision.restored.cols,
          toCols: decision.transient.cols,
          rows: decision.restored.rows
        }
      });
      void window.watchboard.resizeSession(sessionId, decision.transient.cols, decision.transient.rows);
      if (redrawRestoreTimerRef.current !== null) {
        window.clearTimeout(redrawRestoreTimerRef.current);
      }
      redrawRestoreTimerRef.current = window.setTimeout(() => {
        redrawRestoreTimerRef.current = null;
        void window.watchboard.resizeSession(sessionId, decision.restored.cols, decision.restored.rows);
      }, 60);
      return true;
    };
    requestTerminalRedrawRef.current = requestTerminalRedraw;

    void waitForHostReady(host)
      .then(() => {
        const hostSize = readHostSize();
        lastObservedHostSizeRef.current = hostSize;
        if (!performFit("host-ready")) {
          return;
        }
        scheduleCommittedResize("host-ready", 0);
        return waitForNextPaint();
      })
      .then(() => {
        if (xterm.element) {
          xterm.refresh(0, xterm.rows - 1);
        }
      })
      .catch(() => undefined);

    const initialBacklogDecision = resolveTerminalBacklogReplayDecision(sessionBacklogRef.current);
    if (initialBacklogDecision.kind === "hydrate") {
      updateFallbackPhase("hydrating");
      xterm.write(initialBacklogDecision.normalizedBacklog, () => {
        updateVisibleContent(true);
        reportRendererPerf({
          category: "terminal",
          name: "session-backlog-restored",
          durationMs: 0,
          sessionId,
          extra: {
            chars: initialBacklogDecision.normalizedBacklog.length
          }
        });
      });
    } else if (session && session.status !== "stopped") {
      void attachSessionBacklog(sessionId)
        .then((attachedBacklog) => {
          if (sessionBacklogRef.current || !attachedBacklog) {
            return;
          }
          const replayDecision = resolveTerminalBacklogReplayDecision(attachedBacklog);
          if (replayDecision.kind !== "hydrate") {
            return;
          }
          sessionBacklogRef.current = attachedBacklog;
          updateFallbackPhase("hydrating");
          xterm.write(replayDecision.normalizedBacklog, () => {
            updateVisibleContent(true);
            reportRendererPerf({
              category: "terminal",
              name: "session-backlog-restored",
              durationMs: 0,
              sessionId,
              extra: {
                chars: replayDecision.normalizedBacklog.length
              }
            });
          });
        })
        .catch(() => undefined);
    }

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
      const nextHostSize = readHostSize();
      const shouldFit = hasMeaningfulTerminalSizeChange(lastObservedHostSizeRef.current, nextHostSize);
      lastObservedHostSizeRef.current = nextHostSize;
      if (!shouldFit) {
        return;
      }
      scheduleFit("resize-observer");
      scheduleCommittedResize("resize-observer");
    });
    observer.observe(host);

    terminalRef.current = xterm;
    fitAddonRef.current = fitAddon;

    return () => {
      flushLatencySample();
      if (silentReadyTimerRef.current !== null) {
        window.clearTimeout(silentReadyTimerRef.current);
        silentReadyTimerRef.current = null;
      }
      if (redrawRestoreTimerRef.current !== null) {
        window.clearTimeout(redrawRestoreTimerRef.current);
        redrawRestoreTimerRef.current = null;
      }
      if (fitFrameRef.current !== null) {
        cancelAnimationFrame(fitFrameRef.current);
        fitFrameRef.current = null;
      }
      if (resizeSettleTimerRef.current !== null) {
        window.clearTimeout(resizeSettleTimerRef.current);
        resizeSettleTimerRef.current = null;
      }
      if (dataFrameRef.current !== null) {
        cancelAnimationFrame(dataFrameRef.current);
        dataFrameRef.current = null;
      }
      dataBufferRef.current = "";
      lastCommittedGeometryRef.current = null;
      lastObservedHostSizeRef.current = null;
      updateVisibleContentRef.current = null;
      performFitRef.current = null;
      scheduleFitRef.current = null;
      scheduleCommittedResizeRef.current = null;
      requestTerminalRedrawRef.current = null;
      lastStartedAtRef.current = null;
      hasVisibleContentRef.current = false;
      redrawNudgeAttemptedRef.current = false;
      sessionStartMeasureRef.current = null;
      observer.disconnect();
      window.removeEventListener("watchboard:terminal-data", handleTerminalData);
      terminalRef.current = null;
      fitAddonRef.current = null;
      xterm.dispose();
    };
  }, [sessionId, settings.terminalFontFamily, settings.terminalFontSize]);

  useEffect(() => {
    const xterm = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!xterm || !fitAddon || !isVisible) {
      return;
    }
    void waitForNextPaint().then(() => {
      scheduleFitRef.current?.("tab-visible");
      scheduleCommittedResizeRef.current?.("tab-visible", 0);
      focusTerminal();
    });
  }, [isVisible, sessionId]);

  useEffect(() => {
    const xterm = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!xterm || !fitAddon) {
      return;
    }
    const decision = resolveTerminalSessionLifecycle(lastStartedAtRef.current, session);
    lastStartedAtRef.current = decision.nextStartedAt;
    if (!decision.shouldTrack) {
      return;
    }
    setLocalError("");
    lastCommittedGeometryRef.current = null;
    if (decision.shouldReset) {
      hasVisibleContentRef.current = false;
      setHasVisibleContent(false);
      fallbackPhaseRef.current = "waiting";
      setFallbackPhase("waiting");
      redrawNudgeAttemptedRef.current = false;
      xterm.reset();
    }
    scheduleFitRef.current?.(decision.shouldReset ? "session-restart" : "session-attach");
    scheduleCommittedResizeRef.current?.(decision.shouldReset ? "session-restart" : "session-attach", 0);
    if (!hasVisibleContentRef.current) {
      fallbackPhaseRef.current = "waiting";
      setFallbackPhase("waiting");
      sessionStartMeasureRef.current = performance.now();
      return;
    }
    sessionStartMeasureRef.current = null;
  }, [session?.startedAt, session?.status, sessionId]);

  useEffect(() => {
    if (!session || session.status === "stopped" || sessionBacklogRef.current) {
      return;
    }
    const xterm = terminalRef.current;
    if (!xterm) {
      return;
    }
    void attachSessionBacklog(sessionId)
      .then((attachedBacklog) => {
        if (sessionBacklogRef.current || !attachedBacklog) {
          return;
        }
        const replayDecision = resolveTerminalBacklogReplayDecision(attachedBacklog);
        if (replayDecision.kind !== "hydrate") {
          return;
        }
        sessionBacklogRef.current = attachedBacklog;
        fallbackPhaseRef.current = "hydrating";
        setFallbackPhase("hydrating");
        xterm.write(replayDecision.normalizedBacklog, () => {
          updateVisibleContentRef.current?.(true);
          reportRendererPerf({
            category: "terminal",
            name: "session-backlog-restored",
            durationMs: 0,
            sessionId,
            extra: {
              chars: replayDecision.normalizedBacklog.length
            }
          });
        });
      })
      .catch(() => undefined);
  }, [attachSessionBacklog, session, sessionId]);

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
      const recoveryDecision = resolveSilentTerminalRecoveryDecision({
        phase: fallbackPhase,
        hasVisibleContent,
        localError,
        sessionStatus: session.status,
        elapsedMs,
        redrawAlreadyAttempted: redrawNudgeAttemptedRef.current,
        geometry: lastCommittedGeometryRef.current ?? (terminalRef.current ? { cols: terminalRef.current.cols, rows: terminalRef.current.rows } : null)
      });
      const didRequestRedraw =
        recoveryDecision.kind === "redraw-nudge"
          ? (requestTerminalRedrawRef.current?.("silent-ready-timeout") ?? false)
          : false;
      reportRendererPerf({
        category: "interaction",
        name: "session-start-silent-ready",
        durationMs: elapsedMs,
        sessionId
      });
      void window.watchboard.debugLog("terminal-fallback-hidden", {
        sessionId,
        reason: didRequestRedraw ? recoveryDecision.reason : "silent-ready-timeout",
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

  useEffect(() => {
    onTerminalViewStateChange(
      sessionId,
      createTerminalViewState(session?.startedAt ?? null, hasVisibleContent, fallbackPhase)
    );
  }, [fallbackPhase, hasVisibleContent, onTerminalViewStateChange, session?.startedAt, sessionId]);

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
