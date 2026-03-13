import { Profiler, startTransition, useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";

import { AgentConfigPanel } from "@renderer/components/AgentConfigPanel";
import { BoardTree } from "@renderer/components/BoardTree";
import { ConfigDrawer } from "@renderer/components/ConfigDrawer";
import { DoctorModal } from "@renderer/components/DoctorModal";
import { SettingsPanel } from "@renderer/components/SettingsPanel";
import { SkillsPanel } from "@renderer/components/SkillsPanel";
import { WorkbenchView } from "@renderer/components/WorkbenchView";
import { WorkspaceSidebar } from "@renderer/components/WorkspaceSidebar";
import { DoctorIcon, IconButton } from "@renderer/components/IconButton";
import { measureRendererAsync, reportRendererPerf } from "@renderer/perf";
import {
  type AppSettings,
  createTerminalInstance,
  createWorkspaceTemplate,
  type BoardDocument,
  type DiagnosticsInfo,
  type SessionState,
  type TerminalInstance,
  type TerminalProfile,
  type WorkbenchDocument,
  type WorkbenchLayoutModel,
  type WorkspaceEnvironmentFilterMode,
  type WorkspaceFilterMode,
  type WorkspaceSortMode,
  type Workspace,
  type WorkspaceList,
  resolveTerminalStartupCommand
} from "@shared/schema";
import {
  addInstanceToWorkbench,
  collapseInstance,
  collectLayoutInstanceIds,
  findActivePaneId,
  normalizeWorkbenchDocument,
  removeInstanceFromWorkbench,
  restoreInstance,
  updateWorkbenchActivePane
} from "@shared/workbenchModel";

const MAIN_TABS = [
  { id: "terminal", label: "terminal" },
  { id: "skills", label: "skills" },
  { id: "config", label: "config" },
  { id: "settings", label: "settings" }
] as const;

type MainTabId = (typeof MAIN_TABS)[number]["id"];

export function App(): ReactElement {
  const bootStartedAtRef = useRef(performance.now());
  const bootReadyReportedRef = useRef(false);
  const boardVisibleReportedRef = useRef(false);
  const autoStartedRef = useRef<Set<string>>(new Set());
  const workbenchSaveSequenceRef = useRef(0);
  const tabSwitchStartedAtRef = useRef<number | null>(null);
  const [workspaceList, setWorkspaceList] = useState<WorkspaceList | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [draftWorkspace, setDraftWorkspace] = useState<Workspace | null>(null);
  const [workbench, setWorkbench] = useState<WorkbenchDocument | null>(null);
  const [workbenchDirty, setWorkbenchDirty] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null);
  const [boardDocument, setBoardDocument] = useState<BoardDocument | null>(null);
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
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

  const savedWorkspace = workspaceList?.workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const selectedWorkspace =
    draftWorkspace && draftWorkspace.id === selectedWorkspaceId ? draftWorkspace : savedWorkspace ?? draftWorkspace;
  const activePaneInstance = workbench?.instances.find((instance) => instance.paneId === workbench.activePaneId) ?? null;

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
        const initialWorkspace = workspaces.workspaces[0] ?? null;
        if (initialWorkspace) {
          loadWorkspaceIntoEditor(initialWorkspace, setSelectedWorkspaceId, setDraftWorkspace, setIsDirty);
        }
      } catch (bootError) {
        setError(messageOf(bootError));
      }
    };

    unsubscribeData = window.watchboard.onSessionData(({ sessionId, data, emittedAt }) => {
      window.dispatchEvent(
        new CustomEvent("watchboard:terminal-data", {
          detail: { sessionId, data, emittedAt }
        })
      );
    });
    unsubscribeState = window.watchboard.onSessionState((session) => {
      setSessions((current) => {
        const previous = current[session.sessionId];
        if (previous && shallowSessionEquals(previous, session)) {
          return current;
        }
        return {
          ...current,
          [session.sessionId]: session
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
  }, [settings?.boardLocationKind, settings?.boardPath, settings?.boardWslDistro, settings?.updatedAt, boardDocument]);

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
    const liveSessionIds = new Set(workbench.instances.map((instance) => instance.sessionId));
    for (const sessionId of autoStartedRef.current) {
      if (!liveSessionIds.has(sessionId)) {
        autoStartedRef.current.delete(sessionId);
      }
    }

    for (const instance of workbench.instances) {
      if (!instance.autoStart) {
        continue;
      }
      const session = sessions[instance.sessionId];
      if (session && session.status !== "stopped") {
        continue;
      }
      if (autoStartedRef.current.has(instance.sessionId)) {
        continue;
      }
      autoStartedRef.current.add(instance.sessionId);
      void startWorkspaceSession(instance).catch((startError) => {
        autoStartedRef.current.delete(instance.sessionId);
        setError(messageOf(startError));
      });
    }
  }, [sessions, workbench]);

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
      terminals: [normalizeTerminal(workspace, diagnostics)]
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
      });
      setSettings(saved);
      setSettingsDraft(saved);
      setIsSettingsDirty(false);
      setError("");
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleWorkspaceSidebarPreferenceChange(
    update: Partial<Pick<AppSettings, "workspaceSortMode" | "workspaceFilterMode" | "workspaceEnvironmentFilterMode">>
  ): Promise<void> {
    const baseSettings = settings ?? settingsDraft;
    if (!baseSettings) {
      return;
    }
    try {
      const saved = await window.watchboard.saveSettings({
        ...baseSettings,
        ...update,
        updatedAt: new Date().toISOString()
      });
      setSettings(saved);
      setSettingsDraft((current) =>
        current
          ? {
              ...current,
              ...update,
              updatedAt: saved.updatedAt
            }
          : saved
      );
      setError("");
    } catch (saveError) {
      setError(messageOf(saveError));
    }
  }

  async function startWorkspaceSession(instance: TerminalInstance): Promise<void> {
    const session = await window.watchboard.startSession(instance);
    markWorkspaceLaunched(instance.workspaceId, session.startedAt);
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
    field: "terminalFontFamily" | "terminalFontSize" | "boardPath" | "boardLocationKind" | "boardWslDistro",
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

  function handleResetSettings(): void {
    if (!settings) {
      return;
    }
    setSettingsDraft(structuredClone(settings));
    setIsSettingsDirty(false);
    setError("");
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
    const instance = createTerminalInstance(workspace, currentWorkbench.instances);
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
    const instance = createTerminalInstance(workspace, workbench.instances);
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

  function handleWorkbenchLayoutChange(layoutModel: WorkbenchLayoutModel): void {
    if (!workbench) {
      return;
    }
    const visibleInstanceIds = new Set(collectLayoutInstanceIds(layoutModel));
    const removedInstances = workbench.instances.filter((instance) => !visibleInstanceIds.has(instance.instanceId));
    for (const instance of removedInstances) {
      if (sessions[instance.sessionId] && sessions[instance.sessionId]?.status !== "stopped") {
        void window.watchboard.stopSession(instance.sessionId);
      }
    }
    stageWorkbench(
      normalizeWorkbenchDocument({
        ...workbench,
        updatedAt: new Date().toISOString(),
        activePaneId: findActivePaneId(layoutModel),
        instances: workbench.instances.filter((instance) => visibleInstanceIds.has(instance.instanceId)),
        layoutModel
      })
    );
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
            />
          </Profiler>

          <Profiler id="WorkbenchView" onRender={handleProfilerRender}>
            <WorkbenchView
              workbench={workbench}
              workspaces={workspaceList.workspaces}
              sessions={sessions}
              settings={settingsDraft}
              isVisible
              canCreatePane={workspaceList.workspaces.length > 0}
              canSplitPane={Boolean(activePaneInstance ?? selectedWorkspace)}
              onLayoutChange={handleWorkbenchLayoutChange}
              onFocusPane={handleFocusPane}
              onNewPane={handleNewPane}
              onSplitPane={handleSplitPane}
              onClosePane={(instanceId) => void handleClosePane(instanceId)}
              onCollapsePane={handleCollapsePane}
              onRegisterDraggedWorkspace={registerDraggedWorkspace}
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
              <BoardTree document={boardDocument} />
            </Profiler>
          </aside>
        </div>
      </section>
    ) : activeTab === "skills" ? (
      <section className="content-pane is-active">
        <div className="single-view-panel">
          <SkillsPanel settings={settingsDraft} sessions={sessions} diagnostics={diagnostics} />
        </div>
      </section>
    ) : activeTab === "config" ? (
      <section className="content-pane is-active">
        <div className="single-view-panel">
          <AgentConfigPanel />
        </div>
      </section>
    ) : (
      <section className="content-pane is-active">
        <div className="single-view-panel">
          <Profiler id="SettingsPanel" onRender={handleProfilerRender}>
            <SettingsPanel
              settings={settingsDraft}
              diagnostics={diagnostics}
              isDirty={isSettingsDirty}
              isSaving={isSavingSettings}
              onChange={handleSettingsFieldChange}
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

function normalizeTerminal(workspace: Workspace, diagnostics: DiagnosticsInfo | null): TerminalProfile {
  const terminal = workspace.terminals[0];
  if (!terminal) {
    throw new Error("Workspace has no terminal profile");
  }
  const target = terminal.target === "wsl" && diagnostics?.platform !== "win32" ? "linux" : terminal.target;
  const shellOrProgram =
    target === "wsl"
      ? "bash"
      : target === "windows"
        ? "powershell.exe"
        : terminal.shellOrProgram || "/bin/bash";
  const startupCommand = resolveTerminalStartupCommand({
    startupMode: terminal.startupMode,
    startupPresetId: terminal.startupPresetId,
    startupCustomCommand: terminal.startupCustomCommand,
    startupCommand: terminal.startupCommand
  });
  return {
    ...terminal,
    title: workspace.name || terminal.title,
    target,
    shellOrProgram,
    startupCommand
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
