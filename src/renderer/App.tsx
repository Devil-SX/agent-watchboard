import { Profiler, startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";

import { AgentConfigPanel } from "@renderer/components/AgentConfigPanel";
import { AnalysisPanel } from "@renderer/components/AnalysisPanel";
import { resolveAutoStartCandidates } from "@renderer/components/autoStart";
import { BoardTree } from "@renderer/components/BoardTree";
import { ConfigDrawer } from "@renderer/components/ConfigDrawer";
import { DoctorModal } from "@renderer/components/DoctorModal";
import { summarizeInstance, summarizeWorkbenchInstances } from "@renderer/components/sessionDebug";
import { SettingsPanel } from "@renderer/components/SettingsPanel";
import { SkillsPanel } from "@renderer/components/SkillsPanel";
import { buildPaneChatSessionKey, createPaneChatInstance } from "@renderer/components/paneChatSession";
import { shouldStartPaneChatSession } from "@renderer/components/paneChatStartup";
import { createIdleSkillsPaneScanState, isSkillsPaneScanReady } from "@renderer/components/skillsPaneScanState";
import { createTerminalViewState, type TerminalViewState } from "@renderer/components/terminalViewState";
import { buildSkillsChatSessionKey, createSkillsChatInstance } from "@renderer/components/skillsChatSession";
import { canStartSkillsChatSession } from "@renderer/components/skillsChatStartup";
import { applyOptimisticSettingsPreference, hasSettingsPreferenceChange } from "@renderer/components/settingsDraft";
import { WorkbenchView } from "@renderer/components/WorkbenchView";
import { WorkspaceSidebar } from "@renderer/components/WorkspaceSidebar";
import { DoctorIcon, IconButton } from "@renderer/components/IconButton";
import { measureRendererAsync, reportRendererPerf } from "@renderer/perf";
import { appendSessionBacklogChunk } from "@shared/sessionBacklog";
import {
  buildCronRelaunchProfile,
  getCronCountdownLabel,
  isCronEnabledForInstance,
  markCronPendingOnIdle,
  scheduleCronAfterStart,
  syncCronTemplateToInstance
} from "@shared/terminalCron";
import {
  type AnalysisPaneState,
  type AgentConfigPaneState,
  type AppSettings,
  createSshEnvironment,
  createTerminalInstance,
  createWorkspaceTemplate,
  type BoardDocument,
  type DiagnosticsInfo,
  type SettingsPaneState,
  type SessionState,
  type SshEnvironment,
  type SkillsPaneState,
  type TerminalInstance,
  type TerminalProfile,
  type WorkbenchDocument,
  type WorkbenchLayoutModel,
  type WorkspaceEnvironmentFilterMode,
  type WorkspaceFilterMode,
  type WorkspaceSortMode,
  type Workspace,
  type WorkspaceList,
  resolveTerminalStartupCommandWithEnvironment
} from "@shared/schema";
import type { SshSecretInput, SshTestResult } from "@shared/ipc";
import { createRequestId } from "@shared/requestId";
import {
  addInstanceToWorkbench,
  attachExistingInstance,
  collapseInstance,
  reconcileWorkbenchLayoutChange,
  removeInstanceFromWorkbench,
  restoreInstance,
  updateWorkbenchInstance,
  updateWorkbenchWorkspaceInstances,
  updateWorkbenchActivePane
} from "@shared/workbenchModel";

const MAIN_TABS = [
  { id: "terminal", label: "terminal" },
  { id: "skills", label: "skills" },
  { id: "config", label: "config" },
  { id: "analysis", label: "analysis" },
  { id: "settings", label: "settings" }
] as const;

type MainTabId = (typeof MAIN_TABS)[number]["id"];

export function App(): ReactElement {
  const bootStartedAtRef = useRef(performance.now());
  const bootReadyReportedRef = useRef(false);
  const boardVisibleReportedRef = useRef(false);
  const autoStartedRef = useRef<Set<string>>(new Set());
  const knownInstanceIdsRef = useRef<Set<string>>(new Set());
  const sessionRequestStartedAtRef = useRef<Map<string, number>>(new Map());
  const persistedSettingsRef = useRef<AppSettings | null>(null);
  const workbenchSaveSequenceRef = useRef(0);
  const cronRestartInflightRef = useRef<Set<string>>(new Set());
  const tabSwitchStartedAtRef = useRef<number | null>(null);
  const sessionBacklogsRef = useRef<Record<string, string>>({});
  const attachInflightRef = useRef<Map<string, Promise<string>>>(new Map());
  const [workspaceList, setWorkspaceList] = useState<WorkspaceList | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [draftWorkspace, setDraftWorkspace] = useState<Workspace | null>(null);
  const [workbench, setWorkbench] = useState<WorkbenchDocument | null>(null);
  const [workbenchDirty, setWorkbenchDirty] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null);
  const [boardDocument, setBoardDocument] = useState<BoardDocument | null>(null);
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
  const [terminalViewStates, setTerminalViewStates] = useState<Record<string, TerminalViewState>>({});
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSettingsDirty, setIsSettingsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [deleteSelection, setDeleteSelection] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<MainTabId>("terminal");
  const [isDoctorOpen, setIsDoctorOpen] = useState(false);
  const [skillsChatInstance, setSkillsChatInstance] = useState<TerminalInstance | null>(null);
  const [skillsChatError, setSkillsChatError] = useState("");
  const [skillsPaneScanState, setSkillsPaneScanState] = useState(() => createIdleSkillsPaneScanState());
  const skillsPaneScanStateRef = useRef(skillsPaneScanState);
  skillsPaneScanStateRef.current = skillsPaneScanState;
  const [configChatInstance, setConfigChatInstance] = useState<TerminalInstance | null>(null);
  const [configChatError, setConfigChatError] = useState("");
  const [sshSecretDrafts, setSshSecretDrafts] = useState<Record<string, SshSecretInput>>({});
  const [sshTestStates, setSshTestStates] = useState<Record<string, { isRunning: boolean; result: SshTestResult | null }>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const skillsChatKeyRef = useRef<string | null>(null);
  const skillsChatStartRequestRef = useRef(0);
  const configChatKeyRef = useRef<string | null>(null);
  const configChatStartRequestRef = useRef(0);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const workbenchRef = useRef(workbench);
  workbenchRef.current = workbench;

  const savedWorkspace = workspaceList?.workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const selectedWorkspace =
    draftWorkspace && draftWorkspace.id === selectedWorkspaceId ? draftWorkspace : savedWorkspace ?? draftWorkspace;
  const activePaneInstance = workbench?.instances.find((instance) => instance.paneId === workbench.activePaneId) ?? null;
  const cronCountdownByInstanceId = useMemo(
    () => {
      const entries = new Map<string, string>();
      for (const instance of workbench?.instances ?? []) {
        const countdown = getCronCountdownLabel(instance, nowMs);
        if (countdown) {
          entries.set(instance.instanceId, countdown);
        }
      }
      return entries;
    },
    [nowMs, workbench?.instances]
  );

  function emitRendererDebugLog(message: string, details?: unknown): void {
    void window.watchboard.debugLog(message, details).catch(() => undefined);
  }

  function truncateForDebug(value: string, maxLength = 512): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}...<truncated>`;
  }

  function summarizeLaunchProfileForDebug(profile: TerminalProfile): Record<string, unknown> {
    const resolvedStartupCommand = resolveTerminalStartupCommandWithEnvironment(profile);
    return {
      target: profile.target,
      cwd: profile.cwd,
      shellOrProgram: profile.shellOrProgram,
      args: profile.args,
      startupMode: profile.startupMode,
      startupPresetId: profile.startupPresetId ?? null,
      startupCommand: profile.startupCommand ? truncateForDebug(profile.startupCommand) : null,
      startupCustomCommand: profile.startupCustomCommand ? truncateForDebug(profile.startupCustomCommand) : null,
      resolvedStartupCommand: resolvedStartupCommand ? truncateForDebug(resolvedStartupCommand) : null,
      resolvedStartupCommandLength: resolvedStartupCommand.length,
      wslDistro: profile.wslDistro ?? null,
      sshEnvironmentId: profile.sshEnvironmentId ?? null,
      cronEnabled: profile.cron.enabled,
      cronIntervalMinutes: profile.cron.intervalMinutes,
      cronPromptLength: profile.cron.prompt.trim().length
    };
  }

  useEffect(() => {
    let unsubscribeData: () => void = () => {};
    let unsubscribeState: () => void = () => {};
    let unsubscribeBoard: () => void = () => {};

    const boot = async (): Promise<void> => {
      try {
        const [workspaces, nextWorkbench, sessionList, nextDiagnostics, nextSettings] = await Promise.all([
          measureRendererAsync("boot", "list-workspaces", () => window.watchboard.listWorkspaces()),
          measureRendererAsync("boot", "get-workbench", () => window.watchboard.getWorkbench()),
          measureRendererAsync("boot", "list-sessions", () => window.watchboard.listSessions()),
          measureRendererAsync("boot", "get-diagnostics", () => window.watchboard.getDiagnostics()),
          measureRendererAsync("boot", "get-settings", () => window.watchboard.getSettings())
        ]);
        setWorkspaceList(workspaces);
        setWorkbench(nextWorkbench);
        setSessions(indexSessions(sessionList));
        setDiagnostics(nextDiagnostics);
        setSettings(nextSettings);
        setSettingsDraft(nextSettings);
        persistedSettingsRef.current = nextSettings;
        setActiveTab(nextSettings.activeMainTab);
        emitRendererDebugLog("boot-workbench-restored", {
          activeTab: nextSettings.activeMainTab,
          workspaceCount: workspaces.workspaces.length,
          sessionCount: sessionList.length,
          ...summarizeWorkbenchInstances(nextWorkbench)
        });
        const initialWorkspace = workspaces.workspaces[0] ?? null;
        if (initialWorkspace) {
          loadWorkspaceIntoEditor(initialWorkspace, setSelectedWorkspaceId, setDraftWorkspace, setIsDirty);
        }
      } catch (bootError) {
        setError(messageOf(bootError));
      }
    };

    unsubscribeData = window.watchboard.onSessionData(({ sessionId, data, emittedAt }) => {
      sessionBacklogsRef.current[sessionId] = appendSessionBacklogChunk(sessionBacklogsRef.current[sessionId] ?? "", data);
      window.dispatchEvent(
        new CustomEvent("watchboard:terminal-data", {
          detail: { sessionId, data, emittedAt }
        })
      );
    });
    unsubscribeState = window.watchboard.onSessionState((session) => {
      const requestStartedAt = sessionRequestStartedAtRef.current.get(session.sessionId);
      if (requestStartedAt !== undefined) {
        reportRendererPerf({
          category: "session",
          name: "state-received",
          durationMs: performance.now() - requestStartedAt,
          sessionId: session.sessionId,
          workspaceId: session.workspaceId,
          extra: {
            status: session.status
          }
        });
        sessionRequestStartedAtRef.current.delete(session.sessionId);
      }
      setSessions((current) => {
        const previous = current[session.sessionId];
        if (previous && shallowSessionEquals(previous, session)) {
          return current;
        }
        const didRestart = previous?.startedAt && previous.startedAt !== session.startedAt;
        if (session.status === "stopped" || didRestart) {
          delete sessionBacklogsRef.current[session.sessionId];
        }
        return {
          ...current,
          [session.sessionId]: session
        };
      });
      setTerminalViewStates((current) => {
        const previous = current[session.sessionId];
        if (session.status === "stopped") {
          if (!previous) {
            return current;
          }
          const next = { ...current };
          delete next[session.sessionId];
          return next;
        }
        if (previous?.startedAt === session.startedAt) {
          return current;
        }
        return {
          ...current,
          [session.sessionId]: createTerminalViewState(session.startedAt)
        };
      });
    });
    unsubscribeBoard = window.watchboard.onBoardUpdate((document) => {
      setBoardDocument(document);
    });

    void boot();

    return () => {
      unsubscribeData();
      unsubscribeState();
      unsubscribeBoard();
    };
  }, []);

  useEffect(() => {
    if (!settings || boardDocument) {
      return;
    }
    void window.watchboard
      .selectBoard()
      .then(() => {
        setError("");
      })
      .catch((selectError) => {
        setError(messageOf(selectError));
      });
  }, [settings?.boardLocationKind, settings?.hostBoardPath, settings?.wslBoardPath, settings?.boardWslDistro, settings?.updatedAt, boardDocument]);

  function getSessionBacklog(sessionId: string): string {
    return sessionBacklogsRef.current[sessionId] ?? "";
  }

  function getTerminalViewState(sessionId: string): TerminalViewState | null {
    return terminalViewStates[sessionId] ?? null;
  }

  function updateTerminalViewState(sessionId: string, nextState: TerminalViewState): void {
    setTerminalViewStates((current) => {
      const previous = current[sessionId];
      if (
        previous?.startedAt === nextState.startedAt &&
        previous.hasVisibleContent === nextState.hasVisibleContent &&
        previous.fallbackPhase === nextState.fallbackPhase
      ) {
        return current;
      }
      return {
        ...current,
        [sessionId]: nextState
      };
    });
  }

  async function attachSessionBacklog(sessionId: string): Promise<string> {
    const session = sessions[sessionId];
    if (session?.status === "stopped") {
      return "";
    }
    const cachedBacklog = sessionBacklogsRef.current[sessionId] ?? "";
    if (cachedBacklog) {
      return cachedBacklog;
    }
    const inflight = attachInflightRef.current.get(sessionId);
    if (inflight) {
      return await inflight;
    }
    const requestId = createRequestId("attach");
    const nextPromise = window.watchboard
      .attachSession(sessionId, requestId)
      .then((result) => {
        if (!sessionBacklogsRef.current[sessionId] && result.backlog) {
          sessionBacklogsRef.current[sessionId] = result.backlog;
        }
        setTerminalViewStates((current) => ({
          ...current,
          [sessionId]: current[sessionId] ?? createTerminalViewState(result.session.startedAt)
        }));
        return sessionBacklogsRef.current[sessionId] ?? result.backlog;
      })
      .finally(() => {
        attachInflightRef.current.delete(sessionId);
      });
    attachInflightRef.current.set(sessionId, nextPromise);
    return await nextPromise;
  }

  useEffect(() => {
    if (!workspaceList || !workbench || !settingsDraft || bootReadyReportedRef.current) {
      return;
    }
    bootReadyReportedRef.current = true;
    requestAnimationFrame(() => {
      reportRendererPerf({
        category: "boot",
        name: "initial-ready",
        durationMs: performance.now() - bootStartedAtRef.current,
        extra: {
          workspaceCount: workspaceList.workspaces.length,
          instanceCount: workbench.instances.length
        }
      });
    });
  }, [settingsDraft, workbench, workspaceList]);

  useEffect(() => {
    if (!boardDocument || boardVisibleReportedRef.current) {
      return;
    }
    const itemCount = boardDocument.sections.reduce((count, section) => count + section.items.length, 0);
    boardVisibleReportedRef.current = true;
    reportRendererPerf({
      category: "boot",
      name: "board-visible",
      durationMs: performance.now() - bootStartedAtRef.current,
      extra: {
        sectionCount: boardDocument.sections.length,
        itemCount
      }
    });
  }, [boardDocument]);

  useEffect(() => {
    const switchStartedAt = tabSwitchStartedAtRef.current;
    if (switchStartedAt === null) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      reportRendererPerf({
        category: "interaction",
        name: "main-tab-switch",
        durationMs: performance.now() - switchStartedAt,
        extra: {
          activeTab
        }
      });
      tabSwitchStartedAtRef.current = null;
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [activeTab]);

  useEffect(() => {
    if (!workspaceList || workspaceList.workspaces.length === 0) {
      return;
    }
    if (selectedWorkspaceId && workspaceList.workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      return;
    }
    const fallback = workspaceList.workspaces[0];
    if (fallback) {
      loadWorkspaceIntoEditor(fallback, setSelectedWorkspaceId, setDraftWorkspace, setIsDirty);
    }
  }, [selectedWorkspaceId, workspaceList]);

  useEffect(() => {
    if (!workbench) {
      return;
    }
    if (workbench.instances.length === 0) {
      autoStartedRef.current.clear();
      knownInstanceIdsRef.current.clear();
      return;
    }
    const liveSessionIds = new Set(workbench.instances.map((instance) => instance.sessionId));
    for (const sessionId of autoStartedRef.current) {
      if (!liveSessionIds.has(sessionId)) {
        autoStartedRef.current.delete(sessionId);
      }
    }
    const previousKnownIds = knownInstanceIdsRef.current;
    const isInitialBatch = previousKnownIds.size === 0;
    const nextKnownIds = new Set(workbench.instances.map((instance) => instance.instanceId));
    knownInstanceIdsRef.current = nextKnownIds;

    for (const instance of resolveAutoStartCandidates(workbench.instances, previousKnownIds, isInitialBatch)) {
      const session = sessions[instance.sessionId];
      let skipReason: string | null = null;
      if (!instance.autoStart) {
        skipReason = "auto-start-disabled";
      } else if (session && session.status !== "stopped") {
        skipReason = "session-already-live";
      } else if (autoStartedRef.current.has(instance.sessionId)) {
        skipReason = "already-requested";
      }
      emitRendererDebugLog("auto-start-decision", {
        isInitialBatch,
        knownInstanceCount: previousKnownIds.size,
        requestPlanned: !skipReason,
        skipReason,
        sessionStatus: session?.status ?? null,
        ...summarizeInstance(instance)
      });
      if (skipReason) {
        continue;
      }
      autoStartedRef.current.add(instance.sessionId);
      void startWorkspaceSession(instance, {
        requestId: createRequestId("autostart"),
        reason: isInitialBatch ? "initial-batch" : "new-instance"
      }).catch((startError) => {
        autoStartedRef.current.delete(instance.sessionId);
        setError(messageOf(startError));
      });
    }
  }, [sessions, workbench]);

  useEffect(() => {
    if (!(workbench?.instances.some((instance) => isCronEnabledForInstance(instance)))) {
      return;
    }
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [workbench?.instances]);

  useEffect(() => {
    if (!workbench) {
      return;
    }
    let nextWorkbench = workbench;
    const nowIso = new Date(nowMs).toISOString();
    for (const instance of workbench.instances) {
      if (!isCronEnabledForInstance(instance)) {
        continue;
      }
      const session = sessions[instance.sessionId];
      if (!instance.cronState.nextTriggerAt && !instance.cronState.pendingOnIdle && session && session.status !== "stopped") {
        nextWorkbench = updateWorkbenchInstance(nextWorkbench, instance.instanceId, (currentInstance) =>
          scheduleCronAfterStart(currentInstance, session.startedAt)
        );
        continue;
      }
      if (cronRestartInflightRef.current.has(instance.instanceId)) {
        continue;
      }
      if (instance.cronState.pendingOnIdle) {
        if (session?.status === "running-idle") {
          void restartCronInstance(instance);
        }
        continue;
      }
      if (!instance.cronState.nextTriggerAt || Date.parse(instance.cronState.nextTriggerAt) > nowMs) {
        continue;
      }
      if (session?.status === "running-idle") {
        void restartCronInstance(instance);
        continue;
      }
      if (!session || session.status === "stopped") {
        continue;
      }
      nextWorkbench = updateWorkbenchInstance(nextWorkbench, instance.instanceId, (currentInstance) =>
        markCronPendingOnIdle(currentInstance, true, nowIso)
      );
    }
    if (nextWorkbench !== workbench) {
      stageWorkbench(nextWorkbench);
    }
  }, [nowMs, sessions, workbench]);

  const isScanReady = settingsDraft
    ? isSkillsPaneScanReady(skillsPaneScanState, settingsDraft.skillsPane.location)
    : false;

  useEffect(() => {
    if (!settingsDraft) {
      return;
    }
    const platform = diagnostics?.platform;

    function stopPaneChat(
      instance: TerminalInstance | null,
      keyRef: { current: string | null },
      setInstance: (value: TerminalInstance | null) => void,
      setChatError: (value: string) => void
    ): void {
      keyRef.current = null;
      setInstance(null);
      setChatError("");
      if (instance) {
        void window.watchboard.stopSession(instance.sessionId).catch(() => undefined);
      }
    }

    function startPaneChat(
      instance: TerminalInstance,
      reason: string,
      startRequestRef: { current: number },
      setChatError: (value: string) => void
    ): void {
      const requestId = ++startRequestRef.current;
      const startRequestId = createRequestId(reason);
      emitRendererDebugLog("session-invoke-begin", {
        requestId: startRequestId,
        reason,
        ...summarizeInstance(instance)
      });
      void window.watchboard.startSession(instance, startRequestId).then((session) => {
        emitRendererDebugLog("session-invoke-resolved", {
          requestId: startRequestId,
          reason,
          sessionId: session.sessionId,
          status: session.status,
          startedAt: session.startedAt
        });
      }).catch((error) => {
        emitRendererDebugLog("session-invoke-rejected", {
          requestId: startRequestId,
          reason,
          ...summarizeInstance(instance),
          message: messageOf(error)
        });
        if (startRequestRef.current !== requestId) {
          return;
        }
        setChatError(messageOf(error));
      });
    }

    const skillsIsChatOpen = settingsDraft.skillsPane.isChatOpen;
    const shouldAllowSkillsChatStartup = canStartSkillsChatSession(
      activeTab,
      skillsIsChatOpen,
      settingsDraft.skillsPane.location,
      skillsPaneScanStateRef.current
    );
    const nextSkillsKey = skillsIsChatOpen
      ? buildSkillsChatSessionKey(settingsDraft.skillsPane.chatAgent, settingsDraft.skillsPane.location, platform)
      : null;

    if (!skillsIsChatOpen) {
      stopPaneChat(skillsChatInstance, skillsChatKeyRef, setSkillsChatInstance, setSkillsChatError);
    } else if (shouldAllowSkillsChatStartup && nextSkillsKey) {
      const current = skillsChatInstance;
      const nextPrompt = settingsDraft.skillsPane.chatPrompts[settingsDraft.skillsPane.chatAgent];
      if (!current || skillsChatKeyRef.current !== nextSkillsKey) {
        const nextInstance = createSkillsChatInstance(
          settingsDraft.skillsPane.chatAgent,
          settingsDraft.skillsPane.location,
          platform,
          nextPrompt
        );
        const previous = current;
        skillsChatKeyRef.current = nextSkillsKey;
        setSkillsChatInstance(nextInstance);
        setSkillsChatError("");
        startPaneChat(nextInstance, "skills-chat-open", skillsChatStartRequestRef, setSkillsChatError);
        if (previous && previous.sessionId !== nextInstance.sessionId) {
          void window.watchboard.stopSession(previous.sessionId).catch(() => undefined);
        }
      } else {
        const session = sessions[current.sessionId];
        if (session?.status === "stopped") {
          const nextInstance = createSkillsChatInstance(
            settingsDraft.skillsPane.chatAgent,
            settingsDraft.skillsPane.location,
            platform,
            nextPrompt
          );
          skillsChatKeyRef.current = nextSkillsKey;
          setSkillsChatInstance(nextInstance);
          setSkillsChatError("");
          startPaneChat(nextInstance, "skills-chat-restart", skillsChatStartRequestRef, setSkillsChatError);
        }
      }
    }

    const configIsChatOpen = settingsDraft.agentConfigPane.isChatOpen;
    const shouldAllowConfigChatStartup = shouldStartPaneChatSession(activeTab, "config", configIsChatOpen);
    const nextConfigKey = configIsChatOpen
      ? buildPaneChatSessionKey("config", settingsDraft.agentConfigPane.chatAgent, settingsDraft.agentConfigPane.location, platform)
      : null;

    if (!configIsChatOpen) {
      stopPaneChat(configChatInstance, configChatKeyRef, setConfigChatInstance, setConfigChatError);
      return;
    }

    if (!shouldAllowConfigChatStartup || !nextConfigKey) {
      return;
    }

    const configPrompt = settingsDraft.agentConfigPane.chatPrompts[settingsDraft.agentConfigPane.chatAgent];
    const currentConfig = configChatInstance;
    if (!currentConfig || configChatKeyRef.current !== nextConfigKey) {
      const nextInstance = createPaneChatInstance(
        "config",
        settingsDraft.agentConfigPane.chatAgent,
        settingsDraft.agentConfigPane.location,
        platform,
        configPrompt
      );
      const previous = currentConfig;
      configChatKeyRef.current = nextConfigKey;
      setConfigChatInstance(nextInstance);
      setConfigChatError("");
      startPaneChat(nextInstance, "config-chat-open", configChatStartRequestRef, setConfigChatError);
      if (previous && previous.sessionId !== nextInstance.sessionId) {
        void window.watchboard.stopSession(previous.sessionId).catch(() => undefined);
      }
      return;
    }

    const configSession = sessions[currentConfig.sessionId];
    if (configSession?.status === "stopped") {
      const nextInstance = createPaneChatInstance(
        "config",
        settingsDraft.agentConfigPane.chatAgent,
        settingsDraft.agentConfigPane.location,
        platform,
        configPrompt
      );
      configChatKeyRef.current = nextConfigKey;
      setConfigChatInstance(nextInstance);
      setConfigChatError("");
      startPaneChat(nextInstance, "config-chat-restart", configChatStartRequestRef, setConfigChatError);
    }
  }, [activeTab, configChatInstance, diagnostics?.platform, isScanReady, sessions, settingsDraft, skillsChatInstance]);


  useEffect(() => {
    if (!workbench || !workbenchDirty) {
      return;
    }
    const currentSequence = workbenchSaveSequenceRef.current + 1;
    workbenchSaveSequenceRef.current = currentSequence;
    const snapshot = workbench;
    const timer = window.setTimeout(() => {
      void window.watchboard
        .saveWorkbench(snapshot)
        .then((saved) => {
          if (workbenchSaveSequenceRef.current !== currentSequence) {
            return;
          }
          setWorkbench(saved);
          setWorkbenchDirty(false);
        })
        .catch((saveError) => {
          if (workbenchSaveSequenceRef.current !== currentSequence) {
            return;
          }
          setError(messageOf(saveError));
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
    };
  }, [workbench, workbenchDirty]);

  async function selectWorkspace(workspaceId: string, options?: { openConfig?: boolean }): Promise<void> {
    if (!workspaceList) {
      return;
    }
    if (isDirty) {
      await handleWorkspaceSave();
    }
    const workspace = workspaceList.workspaces.find((item) => item.id === workspaceId) ?? null;
    if (!workspace) {
      return;
    }
    loadWorkspaceIntoEditor(workspace, setSelectedWorkspaceId, setDraftWorkspace, setIsDirty);
    if (options?.openConfig) {
      setIsConfigOpen(true);
    }
    setError("");
  }

  function stageWorkbench(nextWorkbench: WorkbenchDocument): void {
    setWorkbench(nextWorkbench);
    setWorkbenchDirty(true);
  }

  function patchWorkbenchInstance(instanceId: string, updater: (instance: TerminalInstance) => TerminalInstance): void {
    const currentWorkbench = workbenchRef.current;
    if (!currentWorkbench) {
      return;
    }
    const nextWorkbench = updateWorkbenchInstance(currentWorkbench, instanceId, updater);
    if (nextWorkbench !== currentWorkbench) {
      stageWorkbench(nextWorkbench);
    }
  }

  async function waitForSessionToStop(sessionId: string, timeoutMs = 5_000): Promise<void> {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      const session = sessionsRef.current[sessionId];
      if (!session || session.status === "stopped") {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 60));
    }
    throw new Error(`Timed out waiting for session ${sessionId} to stop`);
  }

  async function restartCronInstance(instance: TerminalInstance): Promise<void> {
    if (cronRestartInflightRef.current.has(instance.instanceId)) {
      return;
    }
    cronRestartInflightRef.current.add(instance.instanceId);
    try {
      const currentSession = sessionsRef.current[instance.sessionId];
      if (currentSession && currentSession.status !== "stopped") {
        await window.watchboard.stopSession(instance.sessionId, createRequestId("cron-stop"));
        await waitForSessionToStop(instance.sessionId);
      }
      const currentWorkbench = workbenchRef.current;
      const currentInstance = currentWorkbench?.instances.find((item) => item.instanceId === instance.instanceId);
      if (!currentInstance || !isCronEnabledForInstance(currentInstance)) {
        return;
      }
      const reason = currentInstance.cronState.pendingOnIdle ? "cron-pending-idle" : "cron-interval";
      const requestId = createRequestId("cron-restart");
      const resolvedRelaunch = await window.watchboard.resolveCronRelaunchCommand(currentInstance.terminalProfileSnapshot);
      emitRendererDebugLog("cron-restart-begin", {
        requestId,
        reason,
        currentSessionStatus: currentSession?.status ?? "missing",
        cronState: currentInstance.cronState,
        relaunchCommand: truncateForDebug(resolvedRelaunch.command),
        relaunchCommandLength: resolvedRelaunch.command.length,
        relaunchResolution: resolvedRelaunch.resolution,
        relaunchSessionId: resolvedRelaunch.sessionId,
        relaunchNormalizedCwd: resolvedRelaunch.normalizedCwd,
        relaunchResolveError: resolvedRelaunch.error,
        ...summarizeInstance(currentInstance),
        ...summarizeLaunchProfileForDebug(currentInstance.terminalProfileSnapshot)
      });
      const runtimeInstance: TerminalInstance = {
        ...currentInstance,
        autoStart: currentInstance.terminalProfileSnapshot.autoStart,
        terminalProfileSnapshot: buildCronRelaunchProfile(currentInstance.terminalProfileSnapshot, resolvedRelaunch.command),
        updatedAt: new Date().toISOString()
      };
      emitRendererDebugLog("cron-restart-dispatch", {
        requestId,
        reason,
        relaunchResolution: resolvedRelaunch.resolution,
        relaunchSessionId: resolvedRelaunch.sessionId,
        ...summarizeInstance(runtimeInstance),
        ...summarizeLaunchProfileForDebug(runtimeInstance.terminalProfileSnapshot)
      });
      await startWorkspaceSession(runtimeInstance, {
        requestId,
        reason
      });
    } catch (restartError) {
      setError(messageOf(restartError));
    } finally {
      cronRestartInflightRef.current.delete(instance.instanceId);
    }
  }

  function markWorkspaceLaunched(workspaceId: string, launchedAt: string): void {
    setWorkspaceList((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        updatedAt: launchedAt,
        workspaces: current.workspaces.map((workspace) =>
          workspace.id === workspaceId
            ? {
                ...workspace,
                lastLaunchedAt: launchedAt,
                updatedAt: launchedAt
              }
            : workspace
        )
      };
    });
    setDraftWorkspace((current) =>
      current && current.id === workspaceId
        ? {
            ...current,
            lastLaunchedAt: launchedAt,
            updatedAt: launchedAt
          }
        : current
    );
  }

  async function handleWorkspaceSave(workspaceOverride?: Workspace): Promise<void> {
    const workspace = workspaceOverride ?? selectedWorkspace;
    if (!workspace) {
      return;
    }
    const normalizedWorkspace: Workspace = {
      ...workspace,
      terminals: [normalizeTerminal(workspace, diagnostics, settingsDraft)]
    };
    setIsSaving(true);
    try {
      const next = await window.watchboard.saveWorkspace({
        ...normalizedWorkspace,
        updatedAt: new Date().toISOString()
      });
      setWorkspaceList(next);
      const saved = next.workspaces.find((item) => item.id === normalizedWorkspace.id) ?? null;
      if (saved) {
        const currentWorkbench = workbenchRef.current;
        if (currentWorkbench) {
          const savedTerminal = normalizeTerminal(saved, diagnostics, settingsDraft);
          const nextWorkbench = updateWorkbenchWorkspaceInstances(currentWorkbench, saved.id, (instance) =>
            syncCronTemplateToInstance(instance, savedTerminal, saved.updatedAt)
          );
          if (nextWorkbench !== currentWorkbench) {
            stageWorkbench(nextWorkbench);
          }
        }
        loadWorkspaceIntoEditor(saved, setSelectedWorkspaceId, setDraftWorkspace, setIsDirty);
      }
      setError("");
      setIsConfigOpen(false);
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSettingsSave(settingsOverride?: AppSettings): Promise<void> {
    const nextDraft = settingsOverride ?? settingsDraft;
    if (!nextDraft) {
      return;
    }
    setIsSavingSettings(true);
    try {
      const saved = await window.watchboard.saveSettings({
        ...nextDraft,
        updatedAt: new Date().toISOString()
      }, sshSecretDrafts);
      persistedSettingsRef.current = saved;
      setSettings(saved);
      setSettingsDraft(saved);
      setIsSettingsDirty(false);
      setSshSecretDrafts({});
      setSshTestStates({});
      setError("");
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function persistSettingsPreference(
    update: Partial<
      Pick<
        AppSettings,
        "workspaceSortMode" | "workspaceFilterMode" | "workspaceEnvironmentFilterMode" | "activeMainTab" | "skillsPane" | "agentConfigPane"
        | "analysisPane" | "settingsPane"
      >
    >
  ): Promise<void> {
    const baseSettings = persistedSettingsRef.current ?? settings;
    if (!baseSettings) {
      return;
    }
    if (!hasSettingsPreferenceChange(baseSettings, update)) {
      return;
    }
    const optimisticSettings = applyOptimisticSettingsPreference(baseSettings, update);
    persistedSettingsRef.current = optimisticSettings;
    setSettingsDraft(optimisticSettings);
    try {
      const saved = await window.watchboard.saveSettings(optimisticSettings);
      persistedSettingsRef.current = saved;
      setSettings(saved);
      setSettingsDraft(saved);
      setError("");
    } catch (saveError) {
      persistedSettingsRef.current = settings;
      setSettingsDraft(settings);
      setError(messageOf(saveError));
    }
  }

  async function handleWorkspaceSidebarPreferenceChange(
    update: Partial<Pick<AppSettings, "workspaceSortMode" | "workspaceFilterMode" | "workspaceEnvironmentFilterMode">>
  ): Promise<void> {
    await persistSettingsPreference(update);
  }

  async function handleSkillsPaneStateChange(state: SkillsPaneState): Promise<void> {
    await persistSettingsPreference({ skillsPane: state });
  }

  async function handleAgentConfigPaneStateChange(state: AgentConfigPaneState): Promise<void> {
    await persistSettingsPreference({ agentConfigPane: state });
  }

  async function handleSettingsPaneStateChange(state: SettingsPaneState): Promise<void> {
    await persistSettingsPreference({ settingsPane: state });
  }

  async function handleAnalysisPaneStateChange(state: AnalysisPaneState): Promise<void> {
    await persistSettingsPreference({ analysisPane: state });
  }

  async function startWorkspaceSession(
    instance: TerminalInstance,
    options?: {
      requestId?: string;
      reason?: string;
    }
  ): Promise<SessionState> {
    const requestId = options?.requestId ?? createRequestId("session");
    sessionRequestStartedAtRef.current.set(instance.sessionId, performance.now());
    emitRendererDebugLog("session-invoke-begin", {
      requestId,
      reason: options?.reason ?? "workspace-session",
      activePaneId: workbench?.activePaneId ?? null,
      ...summarizeInstance(instance),
      ...summarizeLaunchProfileForDebug(instance.terminalProfileSnapshot)
    });
    reportRendererPerf({
      category: "session",
      name: "start-request",
      durationMs: 0,
      sessionId: instance.sessionId,
      workspaceId: instance.workspaceId,
      extra: {
        target: instance.terminalProfileSnapshot.target,
        requestId,
        reason: options?.reason ?? "workspace-session"
      }
    });
    try {
      const session = await window.watchboard.startSession(instance, requestId);
      emitRendererDebugLog("session-invoke-resolved", {
        requestId,
        reason: options?.reason ?? "workspace-session",
        sessionId: session.sessionId,
        workspaceId: session.workspaceId,
        status: session.status,
        startedAt: session.startedAt
      });
      markWorkspaceLaunched(instance.workspaceId, session.startedAt);
      patchWorkbenchInstance(instance.instanceId, (currentInstance) => scheduleCronAfterStart(currentInstance, session.startedAt));
      return session;
    } catch (error) {
      sessionRequestStartedAtRef.current.delete(instance.sessionId);
      emitRendererDebugLog("session-invoke-rejected", {
        requestId,
        reason: options?.reason ?? "workspace-session",
        ...summarizeInstance(instance),
        ...summarizeLaunchProfileForDebug(instance.terminalProfileSnapshot),
        message: messageOf(error)
      });
      throw error;
    }
  }

  async function handleCreateWorkspace(): Promise<void> {
    const currentCount = workspaceList?.workspaces.length ?? 0;
    const workspace = createWorkspaceTemplate(`Workspace ${currentCount + 1}`, {
      platform: diagnostics?.platform
    });
    await handleWorkspaceSave(workspace);
    setIsConfigOpen(true);
  }

  async function handleDeleteWorkspace(workspaceId = savedWorkspace?.id): Promise<void> {
    if (!workspaceId) {
      return;
    }
    setIsDeletingWorkspace(true);
    try {
      let nextWorkbench = workbench;
      const orphanedInstances = workbench?.instances.filter((instance) => instance.workspaceId === workspaceId) ?? [];
      for (const instance of orphanedInstances) {
        if (sessions[instance.sessionId] && sessions[instance.sessionId]?.status !== "stopped") {
          await window.watchboard.stopSession(instance.sessionId);
        }
        if (nextWorkbench) {
          nextWorkbench = removeInstanceFromWorkbench(nextWorkbench, instance.instanceId);
        }
      }
      if (nextWorkbench) {
        stageWorkbench(nextWorkbench);
      }
      const next = await window.watchboard.deleteWorkspace(workspaceId);
      setWorkspaceList(next);
      setDeleteSelection((current) => current.filter((id) => id !== workspaceId));
      const fallback = next.workspaces[0] ?? null;
      if (fallback) {
        loadWorkspaceIntoEditor(fallback, setSelectedWorkspaceId, setDraftWorkspace, setIsDirty);
      } else {
        clearWorkspaceEditor(setSelectedWorkspaceId, setDraftWorkspace, setIsDirty);
      }
      setIsConfigOpen(false);
      setError("");
    } catch (deleteError) {
      setError(messageOf(deleteError));
    } finally {
      setIsDeletingWorkspace(false);
    }
  }

  async function handleDeleteSelectedWorkspaces(): Promise<void> {
    if (deleteSelection.length === 0) {
      return;
    }
    setIsDeletingWorkspace(true);
    try {
      let nextWorkbench = workbench;
      let nextWorkspaceList = workspaceList;
      for (const workspaceId of deleteSelection) {
        const orphanedInstances = nextWorkbench?.instances.filter((instance) => instance.workspaceId === workspaceId) ?? [];
        for (const instance of orphanedInstances) {
          if (sessions[instance.sessionId] && sessions[instance.sessionId]?.status !== "stopped") {
            await window.watchboard.stopSession(instance.sessionId);
          }
          if (nextWorkbench) {
            nextWorkbench = removeInstanceFromWorkbench(nextWorkbench, instance.instanceId);
          }
        }
        if (nextWorkbench) {
          stageWorkbench(nextWorkbench);
        }
        nextWorkspaceList = await window.watchboard.deleteWorkspace(workspaceId);
      }
      if (nextWorkspaceList) {
        setWorkspaceList(nextWorkspaceList);
        const fallback = nextWorkspaceList.workspaces[0] ?? null;
        if (fallback) {
          loadWorkspaceIntoEditor(fallback, setSelectedWorkspaceId, setDraftWorkspace, setIsDirty);
        } else {
          clearWorkspaceEditor(setSelectedWorkspaceId, setDraftWorkspace, setIsDirty);
        }
      }
      setDeleteSelection([]);
      setIsDeleteMode(false);
      setIsConfigOpen(false);
      setError("");
    } catch (deleteError) {
      setError(messageOf(deleteError));
    } finally {
      setIsDeletingWorkspace(false);
    }
  }

  function handleResetWorkspace(): void {
    if (!savedWorkspace) {
      return;
    }
    loadWorkspaceIntoEditor(savedWorkspace, setSelectedWorkspaceId, setDraftWorkspace, setIsDirty);
    setError("");
  }

  function handleWorkspaceFieldChange(field: "name", value: string): void {
    if (!selectedWorkspace) {
      return;
    }
    const terminal = selectedWorkspace.terminals[0];
    const terminalUpdate =
      field === "name" && terminal ? [{ ...terminal, title: value || terminal.title }] : selectedWorkspace.terminals;

    setDraftWorkspace({
      ...selectedWorkspace,
      [field]: value,
      terminals: terminalUpdate,
      updatedAt: new Date().toISOString()
    });
    setIsDirty(true);
  }

  function handleTerminalChange(update: Partial<TerminalProfile>): void {
    if (!selectedWorkspace) {
      return;
    }
    const currentTerminal = selectedWorkspace.terminals[0];
    if (!currentTerminal) {
      return;
    }
    const nextTerminal: TerminalProfile = {
      ...currentTerminal,
      ...update
    };
    setDraftWorkspace({
      ...selectedWorkspace,
      terminals: [nextTerminal],
      updatedAt: new Date().toISOString()
    });
    setIsDirty(true);
  }

  function handleSettingsFieldChange(
    field: "terminalFontFamily" | "terminalFontSize" | "hostBoardPath" | "wslBoardPath" | "boardWslDistro",
    value: string | number
  ): void {
    if (!settingsDraft) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      [field]: value,
      updatedAt: new Date().toISOString()
    });
    setIsSettingsDirty(true);
  }

  function handleAddSshEnvironment(): void {
    if (!settingsDraft) {
      return;
    }
    const nextEnvironment = createSshEnvironment({
      name: `SSH Environment ${settingsDraft.sshEnvironments.length + 1}`
    });
    setSettingsDraft({
      ...settingsDraft,
      sshEnvironments: [...settingsDraft.sshEnvironments, nextEnvironment],
      updatedAt: new Date().toISOString()
    });
    setIsSettingsDirty(true);
  }

  function handleUpdateSshEnvironment(environmentId: string, update: Partial<SshEnvironment>): void {
    if (!settingsDraft) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      sshEnvironments: settingsDraft.sshEnvironments.map((environment) =>
        environment.id === environmentId
          ? {
              ...environment,
              ...update,
              ...(update.savePassword === false ? { hasSavedPassword: false } : {}),
              ...(update.savePassphrase === false ? { hasSavedPassphrase: false } : {})
            }
          : environment
      ),
      updatedAt: new Date().toISOString()
    });
    if (update.savePassword === false || update.savePassphrase === false) {
      setSshSecretDrafts((current) => ({
        ...current,
        [environmentId]: {
          ...current[environmentId],
          ...(update.savePassword === false ? { password: "" } : {}),
          ...(update.savePassphrase === false ? { passphrase: "" } : {})
        }
      }));
    }
    setIsSettingsDirty(true);
  }

  function handleDeleteSshEnvironment(environmentId: string): void {
    if (!settingsDraft) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      sshEnvironments: settingsDraft.sshEnvironments.filter((environment) => environment.id !== environmentId),
      updatedAt: new Date().toISOString()
    });
    setSshSecretDrafts((current) => {
      const next = { ...current };
      delete next[environmentId];
      return next;
    });
    setSshTestStates((current) => {
      const next = { ...current };
      delete next[environmentId];
      return next;
    });
    setDraftWorkspace((current) => {
      if (!current) {
        return current;
      }
      const terminal = current.terminals[0];
      if (!terminal || terminal.sshEnvironmentId !== environmentId) {
        return current;
      }
      return {
        ...current,
        terminals: [
          {
            ...terminal,
            sshEnvironmentId: undefined,
            startupCommand: "",
            target: diagnostics?.platform === "win32" ? "windows" : "linux"
          }
        ],
        updatedAt: new Date().toISOString()
      };
    });
    setIsDirty((current) => current || selectedWorkspace?.terminals[0]?.sshEnvironmentId === environmentId);
    setIsSettingsDirty(true);
  }

  function handleSshSecretDraftChange(environmentId: string, field: keyof SshSecretInput, value: string): void {
    setSshSecretDrafts((current) => ({
      ...current,
      [environmentId]: {
        ...current[environmentId],
        [field]: value
      }
    }));
    setIsSettingsDirty(true);
  }

  async function handleTestSshEnvironment(environmentId: string): Promise<void> {
    const environment = settingsDraft?.sshEnvironments.find((item) => item.id === environmentId);
    if (!environment) {
      return;
    }
    setSshTestStates((current) => ({
      ...current,
      [environmentId]: {
        isRunning: true,
        result: current[environmentId]?.result ?? null
      }
    }));
    try {
      const result = await window.watchboard.testSshEnvironment(environment, sshSecretDrafts[environmentId]);
      setSshTestStates((current) => ({
        ...current,
        [environmentId]: {
          isRunning: false,
          result
        }
      }));
      setError("");
    } catch (testError) {
      const message = messageOf(testError);
      setSshTestStates((current) => ({
        ...current,
        [environmentId]: {
          isRunning: false,
          result: {
            ok: false,
            message
          }
        }
      }));
      setError(message);
    }
  }

  function handleResetSettings(): void {
    if (!settings) {
      return;
    }
    setSettingsDraft(structuredClone(settings));
    setIsSettingsDirty(false);
    setSshSecretDrafts({});
    setSshTestStates({});
    setError("");
  }

  async function handleOpenDebugPath(debugPath: string): Promise<void> {
    try {
      await window.watchboard.openDebugPath(debugPath);
      setError("");
    } catch (openError) {
      setError(messageOf(openError));
    }
  }

  async function handleBoardLocationChange(location: "host" | "wsl"): Promise<void> {
    if (!settingsDraft) {
      return;
    }
    try {
      const saved = await window.watchboard.saveSettings({
        ...settingsDraft,
        boardLocationKind: location,
        updatedAt: new Date().toISOString()
      });
      setSettings(saved);
      setSettingsDraft(saved);
      setIsSettingsDirty(false);
      setError("");
    } catch (saveError) {
      setError(messageOf(saveError));
    }
  }

  async function registerDraggedWorkspace(
    workspaceId: string,
    options?: {
      openMode?: "tab" | "left" | "right" | "up" | "down";
      anchorPaneId?: string | null;
    }
  ): Promise<TerminalInstance | null> {
    const currentWorkbench = workbench;
    const currentWorkspaceList = workspaceList;
    if (!currentWorkbench || !currentWorkspaceList) {
      return null;
    }
    const workspace = currentWorkspaceList.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      return null;
    }
    const instance = createTerminalInstance(
      {
        ...workspace,
        terminals: [normalizeTerminal(workspace, diagnostics, settingsDraft)]
      },
      currentWorkbench.instances
    );
    reportRendererPerf({
      category: "interaction",
      name: "workspace-drag-open-request",
      durationMs: 0,
      sessionId: instance.sessionId,
      workspaceId,
      extra: {
        target: instance.terminalProfileSnapshot.target,
        openMode: options?.openMode ?? "tab"
      }
    });
    const nextWorkbench = addInstanceToWorkbench(
      currentWorkbench,
      instance,
      options?.openMode ?? "tab",
      options?.anchorPaneId ?? currentWorkbench.activePaneId
    );
    stageWorkbench(nextWorkbench);
    setError("");
    return instance;
  }

  async function openWorkspaceInstance(
    workspaceId: string,
    openMode: "tab" | "left" | "right" | "up" | "down",
    anchorPaneId?: string | null
  ): Promise<void> {
    if (!workbench || !workspaceList) {
      return;
    }
    const workspace = workspaceList.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      setError(`Workspace ${workspaceId} not found`);
      return;
    }
    const instance = createTerminalInstance(
      {
        ...workspace,
        terminals: [normalizeTerminal(workspace, diagnostics, settingsDraft)]
      },
      workbench.instances
    );
    stageWorkbench(addInstanceToWorkbench(workbench, instance, openMode, anchorPaneId));
    setError("");
  }

  async function handleNewPane(): Promise<void> {
    const workspaceId = selectedWorkspace?.id ?? workspaceList?.workspaces[0]?.id ?? "";
    if (!workspaceId) {
      return;
    }
    await openWorkspaceInstance(workspaceId, "tab", workbench?.activePaneId);
  }

  async function handleSplitPane(direction: "right" | "down"): Promise<void> {
    const workspaceId = activePaneInstance?.workspaceId ?? selectedWorkspace?.id ?? workspaceList?.workspaces[0]?.id ?? "";
    if (!workspaceId) {
      return;
    }
    await openWorkspaceInstance(workspaceId, direction, activePaneInstance?.paneId ?? workbench?.activePaneId);
  }

  async function handleClosePane(instanceId: string): Promise<void> {
    if (!workbench) {
      return;
    }
    const instance = workbench.instances.find((item) => item.instanceId === instanceId);
    if (!instance) {
      return;
    }
    if (sessions[instance.sessionId] && sessions[instance.sessionId]?.status !== "stopped") {
      await window.watchboard.stopSession(instance.sessionId);
    }
    stageWorkbench(removeInstanceFromWorkbench(workbench, instanceId));
  }

  function handleCollapsePane(instanceId: string): void {
    if (!workbench) return;
    stageWorkbench(collapseInstance(workbench, instanceId));
  }

  function handleRestorePane(instanceId: string): void {
    if (!workbench) return;
    stageWorkbench(restoreInstance(workbench, instanceId));
  }

  async function registerDraggedInstance(
    instanceId: string,
    options?: {
      openMode?: "tab" | "left" | "right" | "up" | "down";
      anchorPaneId?: string | null;
    }
  ): Promise<void> {
    if (!workbench) {
      return;
    }
    stageWorkbench(
      attachExistingInstance(workbench, instanceId, options?.openMode ?? "tab", options?.anchorPaneId ?? workbench.activePaneId)
    );
  }

  function handleWorkbenchLayoutChange(layoutModel: WorkbenchLayoutModel): void {
    if (!workbench) {
      return;
    }
    const { nextDocument, removedInstances } = reconcileWorkbenchLayoutChange(workbench, layoutModel);
    for (const instance of removedInstances) {
      if (sessions[instance.sessionId] && sessions[instance.sessionId]?.status !== "stopped") {
        void window.watchboard.stopSession(instance.sessionId);
      }
    }
    stageWorkbench(nextDocument);
  }

  function handleFocusPane(paneId: string): void {
    if (!workbench) {
      return;
    }
    stageWorkbench(updateWorkbenchActivePane(workbench, paneId));
  }

  if (!workspaceList || !workbench || !settingsDraft) {
    return <main className="app-loading">Loading Watchboard...</main>;
  }

  const activeTabIndex = MAIN_TABS.findIndex((tab) => tab.id === activeTab);
  const activeContent =
    activeTab === "terminal" ? (
      <section className="content-pane is-active">
        <div className="terminal-workbench">
          <Profiler id="WorkspaceSidebar" onRender={handleProfilerRender}>
            <WorkspaceSidebar
              workspaces={workspaceList.workspaces}
              selectedWorkspaceId={selectedWorkspace?.id ?? ""}
              activePaneId={workbench.activePaneId}
              workbench={workbench}
              sessions={sessions}
              cronCountdownByInstanceId={cronCountdownByInstanceId}
              sortMode={settingsDraft.workspaceSortMode}
              filterMode={settingsDraft.workspaceFilterMode}
              environmentFilterMode={settingsDraft.workspaceEnvironmentFilterMode}
              isDeleteMode={isDeleteMode}
              selectedDeleteIds={deleteSelection}
              onCreateWorkspace={() => void handleCreateWorkspace()}
              onSortModeChange={(sortMode: WorkspaceSortMode) => void handleWorkspaceSidebarPreferenceChange({ workspaceSortMode: sortMode })}
              onFilterModeChange={(filterMode: WorkspaceFilterMode) =>
                void handleWorkspaceSidebarPreferenceChange({ workspaceFilterMode: filterMode })
              }
              onEnvironmentFilterModeChange={(environmentFilterMode: WorkspaceEnvironmentFilterMode) =>
                void handleWorkspaceSidebarPreferenceChange({ workspaceEnvironmentFilterMode: environmentFilterMode })
              }
              onToggleDeleteMode={() => {
                setIsDeleteMode(true);
                setDeleteSelection([]);
                setIsConfigOpen(false);
              }}
              onCancelDeleteMode={() => {
                setIsDeleteMode(false);
                setDeleteSelection([]);
              }}
              onDeleteSelected={() => void handleDeleteSelectedWorkspaces()}
              onToggleDeleteSelection={(workspaceId) => {
                setDeleteSelection((current) =>
                  current.includes(workspaceId) ? current.filter((id) => id !== workspaceId) : [...current, workspaceId]
                );
              }}
              onSelectWorkspace={(workspaceId) => void selectWorkspace(workspaceId, { openConfig: true })}
              onFocusPane={handleFocusPane}
              onClosePane={(instanceId) => void handleClosePane(instanceId)}
              onCollapsePane={handleCollapsePane}
              onRestorePane={handleRestorePane}
              getSessionBacklogPreview={getSessionBacklog}
            />
          </Profiler>

          <Profiler id="WorkbenchView" onRender={handleProfilerRender}>
            <WorkbenchView
              workbench={workbench}
              workspaces={workspaceList.workspaces}
              sessions={sessions}
              cronCountdownByInstanceId={cronCountdownByInstanceId}
              settings={settingsDraft}
              isVisible
              getSessionBacklog={getSessionBacklog}
              getTerminalViewState={getTerminalViewState}
              attachSessionBacklog={attachSessionBacklog}
              onTerminalViewStateChange={updateTerminalViewState}
              canCreatePane={workspaceList.workspaces.length > 0}
              canSplitPane={Boolean(activePaneInstance ?? selectedWorkspace)}
              onLayoutChange={handleWorkbenchLayoutChange}
              onFocusPane={handleFocusPane}
              onNewPane={handleNewPane}
              onSplitPane={handleSplitPane}
              onClosePane={(instanceId) => void handleClosePane(instanceId)}
              onCollapsePane={handleCollapsePane}
              onRegisterDraggedWorkspace={registerDraggedWorkspace}
              onRegisterDraggedInstance={registerDraggedInstance}
            />
          </Profiler>

          <aside className="board-panel">
            <header className="board-panel-header">
              <div>
                <p className="panel-eyebrow">Todo Board</p>
              </div>
              <div className="board-panel-meta">
                <span className="timestamp">
                  {boardDocument?.updatedAt ? new Date(boardDocument.updatedAt).toLocaleString() : "No data"}
                </span>
              </div>
            </header>
            <Profiler id="BoardTree" onRender={handleProfilerRender}>
              <BoardTree
                document={boardDocument}
                boardLocationKind={settingsDraft.boardLocationKind}
                canSwitchLocation={diagnostics?.platform === "win32"}
                onBoardLocationChange={(location) => void handleBoardLocationChange(location)}
              />
            </Profiler>
          </aside>
        </div>
      </section>
    ) : activeTab === "skills" ? (
      <section className="content-pane is-active">
        <div className="single-view-panel">
          <SkillsPanel
            settings={settingsDraft}
            sessions={sessions}
            diagnostics={diagnostics}
            viewState={settingsDraft.skillsPane}
            chatInstance={skillsChatInstance}
            chatError={skillsChatError}
            getSessionBacklog={getSessionBacklog}
            getTerminalViewState={getTerminalViewState}
            attachSessionBacklog={attachSessionBacklog}
            onTerminalViewStateChange={updateTerminalViewState}
            onViewStateChange={(state) => void handleSkillsPaneStateChange(state)}
            onScanStateChange={setSkillsPaneScanState}
          />
        </div>
      </section>
    ) : activeTab === "config" ? (
      <section className="content-pane is-active">
        <div className="single-view-panel">
          <AgentConfigPanel
            settings={settingsDraft}
            sessions={sessions}
            diagnostics={diagnostics}
            viewState={settingsDraft.agentConfigPane}
            chatInstance={configChatInstance}
            chatError={configChatError}
            getSessionBacklog={getSessionBacklog}
            getTerminalViewState={getTerminalViewState}
            attachSessionBacklog={attachSessionBacklog}
            onTerminalViewStateChange={updateTerminalViewState}
            onViewStateChange={(state) => void handleAgentConfigPaneStateChange(state)}
          />
        </div>
      </section>
    ) : activeTab === "analysis" ? (
      <section className="content-pane is-active">
        <div className="single-view-panel">
          <AnalysisPanel
            diagnostics={diagnostics}
            viewState={settingsDraft.analysisPane}
            onViewStateChange={(state) => void handleAnalysisPaneStateChange(state)}
          />
        </div>
      </section>
    ) : (
      <section className="content-pane is-active">
        <div className="single-view-panel">
          <Profiler id="SettingsPanel" onRender={handleProfilerRender}>
            <SettingsPanel
              settings={settingsDraft}
              diagnostics={diagnostics}
              viewState={settingsDraft.settingsPane}
              isDirty={isSettingsDirty}
              isSaving={isSavingSettings}
              sshSecretDrafts={sshSecretDrafts}
              sshTestStates={sshTestStates}
              onChange={handleSettingsFieldChange}
              onAddSshEnvironment={handleAddSshEnvironment}
              onUpdateSshEnvironment={handleUpdateSshEnvironment}
              onDeleteSshEnvironment={handleDeleteSshEnvironment}
              onSshSecretChange={handleSshSecretDraftChange}
              onTestSshEnvironment={(environmentId) => void handleTestSshEnvironment(environmentId)}
              onViewStateChange={(state) => void handleSettingsPaneStateChange(state)}
              onOpenDebugPath={handleOpenDebugPath}
              onSave={() => void handleSettingsSave()}
              onReset={handleResetSettings}
            />
          </Profiler>
        </div>
      </section>
    );

  return (
    <main className="app-shell">
      <div
        className="content-tabs-shell"
        style={
          {
            "--active-index": activeTabIndex
          } as CSSProperties
        }
      >
        <nav className="content-tab-rail" aria-label="Main sections">
          <div className="content-tab-peninsula" aria-hidden="true" />
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? "content-tab-button is-active" : "content-tab-button"}
              onClick={() => {
                if (tab.id === activeTab) {
                  return;
                }
                tabSwitchStartedAtRef.current = performance.now();
                startTransition(() => {
                  setActiveTab(tab.id);
                });
                void persistSettingsPreference({ activeMainTab: tab.id });
              }}
            >
              {tab.label}
            </button>
          ))}
          <div className="content-tab-spacer" />
          <IconButton
            className="content-tab-utility-button"
            label="Doctor"
            icon={<DoctorIcon />}
            onClick={() => setIsDoctorOpen(true)}
          />
        </nav>

        <div className="content-tab-panel">
          {error ? <div className="toolbar-error">{error}</div> : null}
          {activeContent}
        </div>
      </div>

      <ConfigDrawer
        isOpen={isConfigOpen}
        workspace={selectedWorkspace}
        sshEnvironments={settingsDraft.sshEnvironments}
        diagnostics={diagnostics}
        isDirty={isDirty}
        isSaving={isSaving}
        isDeleting={isDeletingWorkspace}
        onClose={() => setIsConfigOpen(false)}
        onSaveWorkspace={() => void handleWorkspaceSave()}
        onResetWorkspace={handleResetWorkspace}
        onDeleteWorkspace={() => void handleDeleteWorkspace()}
        onWorkspaceFieldChange={handleWorkspaceFieldChange}
        onTerminalChange={handleTerminalChange}
      />
      <DoctorModal diagnostics={diagnostics} isOpen={isDoctorOpen} onClose={() => setIsDoctorOpen(false)} />
    </main>
  );
}

function handleProfilerRender(
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDuration: number,
  _baseDuration: number,
  _startTime: number,
  _commitTime: number
): void {
  reportRendererPerf({
    category: "react",
    name: id,
    durationMs: actualDuration,
    extra: {
      phase
    }
  });
}

function loadWorkspaceIntoEditor(
  workspace: Workspace,
  setWorkspaceId: (workspaceId: string) => void,
  setDraftWorkspace: (workspace: Workspace) => void,
  setIsDirty: (isDirty: boolean) => void
): void {
  setWorkspaceId(workspace.id);
  setDraftWorkspace(structuredClone(workspace));
  setIsDirty(false);
}

function clearWorkspaceEditor(
  setWorkspaceId: (workspaceId: string) => void,
  setDraftWorkspace: (workspace: Workspace | null) => void,
  setIsDirty: (isDirty: boolean) => void
): void {
  setWorkspaceId("");
  setDraftWorkspace(null);
  setIsDirty(false);
}

function normalizeTerminal(workspace: Workspace, diagnostics: DiagnosticsInfo | null, settings: AppSettings | null): TerminalProfile {
  const terminal = workspace.terminals[0];
  if (!terminal) {
    throw new Error("Workspace has no terminal profile");
  }
  const target = terminal.target === "wsl" && diagnostics?.platform !== "win32" ? "linux" : terminal.target;
  const sshEnvironment = target === "ssh" ? settings?.sshEnvironments.find((item) => item.id === terminal.sshEnvironmentId) : undefined;
  const shellOrProgram =
    target === "ssh"
      ? diagnostics?.platform === "win32"
        ? "powershell.exe"
        : "/bin/bash"
      : target === "wsl"
      ? "bash"
      : target === "windows"
        ? "powershell.exe"
        : terminal.shellOrProgram || "/bin/bash";
  const startupCommand = resolveTerminalStartupCommandWithEnvironment(
    {
      target,
      sshEnvironmentId: terminal.sshEnvironmentId,
      startupMode: terminal.startupMode,
      startupPresetId: terminal.startupPresetId,
      startupCustomCommand: terminal.startupCustomCommand,
      startupCommand: terminal.startupCommand
    },
    sshEnvironment
  );
  return {
    ...terminal,
    title: workspace.name || terminal.title,
    target,
    shellOrProgram,
    startupCommand,
    startupCustomCommand: target === "ssh" ? "" : terminal.startupCustomCommand
  };
}

function indexSessions(sessions: SessionState[]): Record<string, SessionState> {
  return Object.fromEntries(sessions.map((session) => [session.sessionId, session]));
}

function shallowSessionEquals(left: SessionState, right: SessionState): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.pid === right.pid &&
    left.status === right.status &&
    left.logFilePath === right.logFilePath &&
    left.lastPtyActivityAt === right.lastPtyActivityAt &&
    left.lastLogHeartbeatAt === right.lastLogHeartbeatAt &&
    left.startedAt === right.startedAt &&
    left.endedAt === right.endedAt
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
