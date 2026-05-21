import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { AgentConfigReadonlyView } from "@renderer/components/AgentConfigReadonlyView";
import { AgentBadge, getAgentLabel } from "@renderer/components/AgentBadge";
import {
  formatAgentConfigLabel,
} from "@renderer/components/agentConfigEditor";
import { ChatPromptEditor } from "@renderer/components/ChatPromptEditor";
import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { ClaudeIcon, CodexIcon, OpenCodeIcon } from "@renderer/components/IconButton";
import { LayerEditor } from "@renderer/components/LayerEditor";
import { LayerList } from "@renderer/components/LayerList";
import { LocationBadge } from "@renderer/components/LocationBadge";
import { areAgentConfigPaneStatesEqual } from "@renderer/components/settingsDraft";
import { type SkillsChatAgent } from "@renderer/components/skillsChatSession";
import { TerminalTabView } from "@renderer/components/TerminalTabView";
import { type TerminalViewState } from "@renderer/components/terminalViewState";
import type {
  AgentConfigEntry,
  AgentConfigFileId,
  AgentConfigFamily,
  AgentConfigFormat,
  AgentConfigPaneState,
  AgentPathLocation,
  AppSettings,
  ConfigLayerStack,
  DiagnosticsInfo,
  MergedAgentConfigResult,
  SessionState,
  TerminalInstance
} from "@shared/schema";
import { createDefaultConfigSortPreset, getResolvedConfigSortLayers } from "@shared/schema";

type Props = {
  settings: AppSettings;
  sessions: Record<string, SessionState>;
  diagnostics: DiagnosticsInfo | null;
  viewState: AgentConfigPaneState;
  chatInstance: TerminalInstance | null;
  chatError: string;
  getSessionBacklog: (sessionId: string) => string;
  getTerminalViewState: (sessionId: string) => TerminalViewState | null;
  attachSessionBacklog: (sessionId: string) => Promise<string>;
  onTerminalViewStateChange: (sessionId: string, state: TerminalViewState) => void;
  onViewStateChange: (state: AgentConfigPaneState) => void;
};

function createEmptyLayerStack(configId: AgentConfigFileId, location: AgentPathLocation): ConfigLayerStack {
  return {
    version: 2,
    configId,
    location,
    layers: [],
    sortPresets: [createDefaultConfigSortPreset([])],
    activeSortPresetId: null,
    updatedAt: ""
  };
}

function buildAgentConfigTabIcon(entry: AgentConfigEntry): ReactElement {
  if (entry.family === "claude") {
    return <ClaudeIcon className="agent-config-tab-agent-icon" />;
  }
  if (entry.family === "opencode") {
    return <OpenCodeIcon className="agent-config-tab-agent-icon" />;
  }
  return <CodexIcon className="agent-config-tab-agent-icon" />;
}

export function AgentConfigPanel({
  settings,
  sessions,
  diagnostics,
  viewState,
  chatInstance,
  chatError,
  getSessionBacklog,
  getTerminalViewState,
  attachSessionBacklog,
  onTerminalViewStateChange,
  onViewStateChange
}: Props): ReactElement {
  const [activeConfigId, setActiveConfigId] = useState<AgentConfigFileId>(viewState.activeConfigId);
  const [location, setLocation] = useState<AgentPathLocation>(viewState.location);
  const [familyFilter, setFamilyFilter] = useState<"all" | AgentConfigFamily>(viewState.familyFilter);
  const [isChatOpen, setIsChatOpen] = useState(viewState.isChatOpen);
  const [chatAgent, setChatAgent] = useState<SkillsChatAgent>(viewState.chatAgent);
  const [skipDangerous, setSkipDangerous] = useState(viewState.skipDangerous);
  const [chatPrompts, setChatPrompts] = useState(viewState.chatPrompts);
  const [entries, setEntries] = useState<AgentConfigEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Layer state
  const [layerStack, setLayerStack] = useState<ConfigLayerStack | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(viewState.activeLayerId ?? null);
  const [layerViewMode, setLayerViewMode] = useState<"current" | "edit" | "merged">(viewState.layerViewMode ?? "current");
  const [currentFileContent, setCurrentFileContent] = useState("");
  const [mergedResult, setMergedResult] = useState<MergedAgentConfigResult | null>(null);
  const [mergedLoading, setMergedLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyConfirm, setApplyConfirm] = useState(false);

  const persistReadyRef = useRef(false);
  const isApplyingViewStateRef = useRef(false);

  const isWindows = diagnostics?.platform === "win32";
  const activeEntry = entries.find((entry) => entry.id === activeConfigId) ?? null;
  const selectedAgent: AgentConfigFamily = useMemo(() => {
    if (familyFilter !== "all") {
      return familyFilter;
    }
    return activeEntry?.family ?? entries[0]?.family ?? "codex";
  }, [activeEntry?.family, entries, familyFilter]);
  const agentFamilies = useMemo(() => {
    const seen = new Set<AgentConfigFamily>();
    return entries
      .map((entry) => entry.family)
      .filter((family): family is AgentConfigFamily => {
        if (seen.has(family)) {
          return false;
        }
        seen.add(family);
        return true;
      });
  }, [entries]);
  const visibleEntries = useMemo(
    () => entries.filter((entry) => entry.family === selectedAgent),
    [entries, selectedAgent]
  );
  const activeFormat: AgentConfigFormat = activeEntry?.format ?? "json";
  const resolvedLayers = useMemo(() => (layerStack ? getResolvedConfigSortLayers(layerStack) : []), [layerStack]);
  const activeLayer = resolvedLayers.find(({ layer }) => layer.id === activeLayerId)?.layer ?? null;

  const normalizedActiveConfigId =
    activeConfigId === "codex-config" ||
    activeConfigId === "codex-auth" ||
    activeConfigId === "claude-settings" ||
    activeConfigId === "opencode-config" ||
    activeConfigId === "opencode-tui"
      ? activeConfigId
      : "codex-config";
  const currentPaneState: AgentConfigPaneState = {
    location,
    familyFilter,
    activeConfigId: normalizedActiveConfigId,
    isChatOpen,
    chatAgent,
    skipDangerous,
    chatPrompts,
    activeLayerId,
    layerViewMode
  };

  // Load config entries when location changes
  useEffect(() => {
    setLoading(true);
    setError("");
    void window.watchboard
      .listAgentConfigs(location)
      .then((nextEntries) => {
        setEntries(nextEntries);
        if (!nextEntries.some((entry) => entry.id === activeConfigId)) {
          setActiveConfigId(nextEntries[0]?.id ?? activeConfigId);
        }
      })
      .catch((loadError: unknown) => {
        setEntries([]);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => setLoading(false));
  }, [activeConfigId, location]);

  // Load layer stack when config or location changes
  useEffect(() => {
    void window.watchboard
      .getLayerStack(activeConfigId, location)
      .then((stack) => {
        setLayerStack(stack);
        const firstLayerId = getResolvedConfigSortLayers(stack)[0]?.layer.id ?? null;
        setActiveLayerId((current) => (current && stack.layers.some((layer) => layer.id === current) ? current : firstLayerId));
      })
      .catch(() => setLayerStack(null));
  }, [activeConfigId, location]);

  useEffect(() => {
    if (resolvedLayers.length === 0) {
      if (activeLayerId !== null) {
        setActiveLayerId(null);
      }
      return;
    }
    if (activeLayerId && resolvedLayers.some(({ layer }) => layer.id === activeLayerId)) {
      return;
    }
    setActiveLayerId(resolvedLayers[0]?.layer.id ?? null);
  }, [activeLayerId, resolvedLayers]);

  // Load current canonical file content
  useEffect(() => {
    void window.watchboard
      .readAgentConfig(activeConfigId, location)
      .then((doc) => setCurrentFileContent(doc.content))
      .catch(() => setCurrentFileContent(""));
  }, [activeConfigId, location]);

  // Compute merged result when viewing merged preview or when stack changes
  const refreshMerged = useCallback(() => {
    setMergedLoading(true);
    void window.watchboard
      .computeMergedAgentConfig(selectedAgent, location)
      .then(setMergedResult)
      .catch(() => setMergedResult(null))
      .finally(() => setMergedLoading(false));
  }, [location, selectedAgent]);

  useEffect(() => {
    if (layerViewMode === "merged") {
      refreshMerged();
    }
  }, [layerViewMode, refreshMerged]);

  // Sync viewState from parent
  useEffect(() => {
    isApplyingViewStateRef.current = true;
    setLocation(viewState.location);
    setFamilyFilter(viewState.familyFilter);
    setActiveConfigId(viewState.activeConfigId);
    setIsChatOpen(viewState.isChatOpen);
    setChatAgent(viewState.chatAgent);
    setSkipDangerous(viewState.skipDangerous);
    setChatPrompts(viewState.chatPrompts);
    setActiveLayerId(viewState.activeLayerId ?? null);
    setLayerViewMode(viewState.layerViewMode ?? "current");
  }, [viewState]);

  // Ensure activeConfigId stays within visible entries
  useEffect(() => {
    if (visibleEntries.length === 0) return;
    if (visibleEntries.some((entry) => entry.id === activeConfigId)) return;
    setActiveConfigId(visibleEntries[0]?.id ?? activeConfigId);
  }, [activeConfigId, visibleEntries]);

  // Force host on non-Windows
  useEffect(() => {
    if (!isWindows) setLocation("host");
  }, [isWindows]);

  // Persist pane state changes
  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    if (areAgentConfigPaneStatesEqual(currentPaneState, viewState)) {
      if (isApplyingViewStateRef.current) isApplyingViewStateRef.current = false;
      return;
    }
    if (isApplyingViewStateRef.current) return;
    void onViewStateChange(currentPaneState);
  }, [activeConfigId, activeLayerId, chatAgent, skipDangerous, chatPrompts, currentPaneState, familyFilter, isChatOpen, layerViewMode, location, onViewStateChange, viewState]);

  async function persistLayerStack(nextStack: ConfigLayerStack): Promise<ConfigLayerStack> {
    const saved = await window.watchboard.saveLayerStack(nextStack);
    setLayerStack(saved);
    if (layerViewMode === "merged") {
      refreshMerged();
    }
    return saved;
  }

  // Layer action handlers
  async function handleToggleLayer(layerId: string, enabled: boolean): Promise<void> {
    if (!layerStack) return;
    const activeSortPresetId = layerStack.activeSortPresetId ?? layerStack.sortPresets[0]?.id ?? null;
    if (!activeSortPresetId) return;
    await persistLayerStack({
      ...layerStack,
      activeSortPresetId,
      sortPresets: layerStack.sortPresets.map((preset) =>
        preset.id === activeSortPresetId
          ? {
              ...preset,
              items: preset.items.map((item) => (item.layerId === layerId ? { ...item, enabled } : item))
            }
          : preset
      )
    });
  }

  async function handleReorderLayers(orderedIds: string[]): Promise<void> {
    if (!layerStack) return;
    const activeSortPresetId = layerStack.activeSortPresetId ?? layerStack.sortPresets[0]?.id ?? null;
    if (!activeSortPresetId) return;
    await persistLayerStack({
      ...layerStack,
      activeSortPresetId,
      sortPresets: layerStack.sortPresets.map((preset) => {
        if (preset.id !== activeSortPresetId) {
          return preset;
        }
        const byId = new Map(preset.items.map((item) => [item.layerId, item]));
        const reordered = orderedIds
          .map((layerId) => byId.get(layerId))
          .filter((item): item is NonNullable<typeof item> => item != null);
        for (const item of preset.items) {
          if (!orderedIds.includes(item.layerId)) {
            reordered.push(item);
          }
        }
        return {
          ...preset,
          items: reordered
        };
      })
    });
  }

  async function handleAddLayer(): Promise<void> {
    if (!layerStack) return;
    const name = `Layer ${layerStack.layers.length + 1}`;
    const newLayer = { id: globalThis.crypto.randomUUID(), name };
    await persistLayerStack({
      ...layerStack,
      layers: [...layerStack.layers, newLayer],
      sortPresets: layerStack.sortPresets.map((preset) => ({
        ...preset,
        items: [...preset.items, { layerId: newLayer.id, enabled: true }]
      }))
    });
    setActiveLayerId(newLayer.id);
    setLayerViewMode("edit");
  }

  async function handleDeleteLayer(layerId: string): Promise<void> {
    const saved = await window.watchboard.deleteLayer(activeConfigId, layerId, location);
    setLayerStack(saved);
    if (activeLayerId === layerId) {
      setActiveLayerId(getResolvedConfigSortLayers(saved)[0]?.layer.id ?? null);
    }
    if (layerViewMode === "merged") refreshMerged();
  }

  async function handleRenameLayer(layerId: string, name: string): Promise<void> {
    if (!layerStack) return;
    await persistLayerStack({
      ...layerStack,
      layers: layerStack.layers.map((layer) => (layer.id === layerId ? { ...layer, name } : layer))
    });
  }

  async function handleImportBaseLayer(): Promise<void> {
    const { stack: saved, importedLayerId } = await window.watchboard.importBaseLayer(activeConfigId, location);
    setLayerStack(saved);
    setActiveLayerId(importedLayerId);
    setLayerViewMode("edit");
  }

  async function handleSelectSortPreset(presetId: string): Promise<void> {
    if (!layerStack || presetId === layerStack.activeSortPresetId) return;
    await persistLayerStack({
      ...layerStack,
      activeSortPresetId: presetId
    });
  }

  async function handleCreateSortPreset(): Promise<void> {
    if (!layerStack) return;
    const presetId = globalThis.crypto.randomUUID();
    await persistLayerStack({
      ...layerStack,
      sortPresets: [
        ...layerStack.sortPresets,
        {
          id: presetId,
          name: `Sort ${layerStack.sortPresets.length + 1}`,
          items: resolvedLayers.map(({ layer, enabled }) => ({
            layerId: layer.id,
            enabled
          }))
        }
      ],
      activeSortPresetId: presetId
    });
  }

  async function handleRenameSortPreset(presetId: string, name: string): Promise<void> {
    if (!layerStack) return;
    await persistLayerStack({
      ...layerStack,
      sortPresets: layerStack.sortPresets.map((preset) => (preset.id === presetId ? { ...preset, name } : preset))
    });
  }

  async function handleDeleteSortPreset(presetId: string): Promise<void> {
    if (!layerStack || layerStack.sortPresets.length <= 1) return;
    const nextSortPresets = layerStack.sortPresets.filter((preset) => preset.id !== presetId);
    await persistLayerStack({
      ...layerStack,
      sortPresets: nextSortPresets,
      activeSortPresetId:
        layerStack.activeSortPresetId === presetId ? nextSortPresets[0]?.id ?? null : layerStack.activeSortPresetId
    });
  }

  async function handleApplyMerged(): Promise<void> {
    setApplying(true);
    try {
      await window.watchboard.applyMergedAgentConfig(selectedAgent, location);
      const doc = await window.watchboard.readAgentConfig(activeConfigId, location);
      setCurrentFileContent(doc.content);
      refreshMerged();
      setApplyConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="agent-config-panel">
      <header className="agent-config-panel-header">
        <div>
          <p className="panel-eyebrow">Agent Config</p>
        </div>
        <div className="agent-config-toolbar">
          {isWindows ? (
            <CompactToggleButton
              label="Path"
              value={<LocationBadge location={location} />}
              onClick={() => setLocation((current) => (current === "host" ? "wsl" : "host"))}
            />
          ) : null}
          <CompactToggleButton
            label="Chat"
            value={isChatOpen ? "Open" : "Off"}
            onClick={() => setIsChatOpen((current) => !current)}
          />
          {isChatOpen ? (
            <CompactDropdown
              label="Agent"
              value={chatAgent}
              options={[
                { label: "Codex", value: "codex", content: <AgentBadge agent="codex" /> },
                { label: "Claude", value: "claude", content: <AgentBadge agent="claude" /> }
              ]}
              onChange={setChatAgent}
            />
          ) : null}
          {isChatOpen ? (
            <CompactToggleButton
              label="Skip"
              value={skipDangerous ? "Dangerous" : "Safe"}
              onClick={() => setSkipDangerous((current) => !current)}
            />
          ) : null}
        </div>
      </header>

      <div className={isChatOpen ? "agent-config-body has-chat" : "agent-config-body"}>
        <div className="agent-config-main">
          <div className="agent-config-navigation">
            <div className="agent-config-nav-row">
              <span className="agent-config-nav-label">Agent</span>
              <nav className="agent-config-tabs agent-config-agent-tabs" aria-label="Agent backend">
                {agentFamilies.map((family) => (
                  <button
                    key={family}
                    type="button"
                    className={family === selectedAgent ? "agent-config-tab is-active" : "agent-config-tab"}
                    onClick={() => setFamilyFilter(family)}
                  >
                    <AgentBadge agent={family} showLabel={false} />
                    {getAgentLabel(family)}
                  </button>
                ))}
              </nav>
            </div>
            <div className="agent-config-nav-row">
              <span className="agent-config-nav-label">File</span>
              <nav className="agent-config-tabs agent-config-file-tabs" aria-label="Config file">
                {visibleEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={entry.id === activeConfigId ? "agent-config-tab is-active" : "agent-config-tab"}
                    onClick={() => setActiveConfigId(entry.id)}
                  >
                    {buildAgentConfigTabIcon(entry)}
                    {entry.label}
                    {entry.isSymlink ? <span className="entry-badge">Softlink</span> : null}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {error ? <div className="toolbar-error">{error}</div> : null}
          {loading ? <div className="panel-empty"><p>Loading configs...</p></div> : null}

          {activeEntry ? (
            <div className="agent-config-source-bar">
              <div className="agent-config-source-badges">
                <AgentBadge agent={activeEntry.family} tone="strong" />
                <LocationBadge location={activeEntry.location} tone="strong" />
                <span className="entry-badge">{activeEntry.label}</span>
              </div>
              <div className="agent-config-source-paths">
                <span className="agent-config-source-path" title={activeEntry.entryPath}>
                  {activeEntry.entryPath}
                </span>
                {activeEntry.resolvedPath !== activeEntry.entryPath ? (
                  <span className="agent-config-source-path is-resolved" title={activeEntry.resolvedPath}>
                    {activeEntry.resolvedPath}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="agent-config-layer-panel">
            <LayerList
              stack={layerStack ?? createEmptyLayerStack(activeConfigId, location)}
              activeLayerId={activeLayerId}
              onSelectLayer={(id) => {
                setActiveLayerId(id);
                setLayerViewMode("edit");
              }}
              onToggleLayerEnabled={(id, enabled) => void handleToggleLayer(id, enabled)}
              onReorderLayers={(ids) => void handleReorderLayers(ids)}
              onAddLayer={() => void handleAddLayer()}
              onDeleteLayer={(id) => void handleDeleteLayer(id)}
              onRenameLayer={(id, name) => void handleRenameLayer(id, name)}
              onImportBaseLayer={() => void handleImportBaseLayer()}
              onSelectSortPreset={(presetId) => void handleSelectSortPreset(presetId)}
              onCreateSortPreset={() => void handleCreateSortPreset()}
              onRenameSortPreset={(presetId, name) => void handleRenameSortPreset(presetId, name)}
              onDeleteSortPreset={(presetId) => void handleDeleteSortPreset(presetId)}
            />

            <div className="agent-config-layer-content">
              <nav className="agent-config-layer-view-tabs">
                <button
                  type="button"
                  className={layerViewMode === "current" ? "agent-config-tab is-active" : "agent-config-tab"}
                  onClick={() => setLayerViewMode("current")}
                >
                  Current File
                </button>
                <button
                  type="button"
                  className={layerViewMode === "edit" ? "agent-config-tab is-active" : "agent-config-tab"}
                  onClick={() => setLayerViewMode("edit")}
                >
                  Edit Layer
                </button>
                <button
                  type="button"
                  className={layerViewMode === "merged" ? "agent-config-tab is-active" : "agent-config-tab"}
                  onClick={() => setLayerViewMode("merged")}
                >
                  Merged Preview
                </button>
              </nav>

              {layerViewMode === "current" ? (
                <CurrentFilePreview content={currentFileContent} format={activeFormat} />
              ) : layerViewMode === "edit" ? (
                <LayerEditor
                  layer={activeLayer}
                  configId={activeConfigId}
                  format={activeFormat}
                  location={location}
                />
              ) : (
                <AgentMergedPreview
                  mergedResult={mergedResult}
                  loading={mergedLoading}
                  onApply={() => void handleApplyMerged()}
                  applying={applying}
                  applyConfirm={applyConfirm}
                  onApplyConfirmToggle={() => setApplyConfirm((c) => !c)}
                />
              )}
            </div>
          </div>
        </div>

        {isChatOpen && chatInstance ? (
          <div className="skills-chat-panel">
            <div className="skills-chat-header">
              <div className="skills-chat-title">
                <span className="skills-list-icon">{chatAgent === "codex" ? <CodexIcon /> : <ClaudeIcon />}</span>
                <strong>{chatAgent === "codex" ? "Codex Config Chat" : "Claude Config Chat"}</strong>
              </div>
              <button type="button" className="secondary-button skills-chat-close" onClick={() => setIsChatOpen(false)}>
                Hide
              </button>
            </div>
            <div className="entry-meta">
              <span className="entry-meta-label">Scope</span>
              <code>Scoped config session in ~</code>
              <span className={skipDangerous ? "entry-badge doctor-badge-error" : "entry-badge"}>
                {skipDangerous ? "Skip Dangerous On" : "Skip Dangerous Off"}
              </span>
              {chatError ? <span className="toolbar-error">{chatError}</span> : null}
            </div>
            <ChatPromptEditor
              agent={chatAgent}
              prompt={chatPrompts[chatAgent]}
              onPromptChange={(prompt) =>
                setChatPrompts((current) => ({
                  ...current,
                  [chatAgent]: prompt
                }))}
            />
            <div className="skills-chat-terminal">
              <TerminalTabView
                instance={chatInstance}
                session={sessions[chatInstance.sessionId] ?? null}
                settings={settings}
                isVisible
                sessionBacklog={getSessionBacklog(chatInstance.sessionId)}
                terminalViewState={getTerminalViewState(chatInstance.sessionId)}
                attachSessionBacklog={attachSessionBacklog}
                onTerminalViewStateChange={onTerminalViewStateChange}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AgentMergedPreview({
  mergedResult,
  loading,
  onApply,
  applying,
  applyConfirm,
  onApplyConfirmToggle
}: {
  mergedResult: MergedAgentConfigResult | null;
  loading: boolean;
  onApply: () => void;
  applying: boolean;
  applyConfirm: boolean;
  onApplyConfirmToggle: () => void;
}): ReactElement {
  if (loading) {
    return (
      <div className="merged-preview-empty">
        <p>Computing merged agent config...</p>
      </div>
    );
  }

  if (!mergedResult || mergedResult.enabledLayerCount === 0) {
    return (
      <div className="merged-preview-empty">
        <p>No enabled layers. Enable at least one layer in this agent to see the merged result.</p>
      </div>
    );
  }

  return (
    <div className="merged-preview agent-merged-preview">
      <div className="agent-config-editor-status">
        <div className="agent-config-editor-status-copy">
          <AgentBadge agent={mergedResult.family} tone="strong" />
          <span className="entry-badge">
            Merged Agent ({mergedResult.enabledLayerCount}/{mergedResult.layerCount} layers)
          </span>
          <span className="entry-badge">{mergedResult.files.length} files</span>
        </div>
      </div>

      <div className="agent-merged-preview-files">
        {mergedResult.files.map((file) => (
          <section key={file.configId} className="agent-merged-preview-file">
            <div className="agent-merged-preview-file-header">
              <div className="agent-config-editor-status-copy">
                <span className="entry-badge">{file.label}</span>
                <span className="entry-badge">{formatAgentConfigLabel(file.format)}</span>
                <span className="entry-badge">
                  {file.enabledLayerCount}/{file.layerCount} layers
                </span>
              </div>
              <span className="agent-config-source-path" title={file.entryPath}>
                {file.entryPath}
              </span>
            </div>
            {file.enabledLayerCount > 0 ? (
              <div className="agent-config-editor-surface merged-preview-surface agent-merged-preview-surface">
                <AgentConfigReadonlyView
                  ariaLabel={`${file.label} merged config preview`}
                  content={file.content}
                  format={file.format}
                />
              </div>
            ) : (
              <div className="layer-editor-empty agent-merged-preview-empty-file">
                <p>No enabled layers for this file.</p>
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="merged-preview-actions">
        {applyConfirm ? (
          <div className="merged-apply-confirm">
            <span className="merged-apply-confirm-text">
              This will overwrite every target file in this agent that has enabled merged layers.
            </span>
            <button type="button" className="primary-button" disabled={applying} onClick={onApply}>
              {applying ? "Applying..." : "Confirm Apply"}
            </button>
            <button type="button" className="secondary-button" onClick={onApplyConfirmToggle}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="primary-button" onClick={onApplyConfirmToggle}>
            Apply to Agent Files
          </button>
        )}
      </div>
    </div>
  );
}

function CurrentFilePreview({ content, format }: { content: string; format: AgentConfigFormat }): ReactElement {
  if (!content) {
    return (
      <div className="layer-editor-empty">
        <p>Config file is empty or does not exist yet.</p>
      </div>
    );
  }

  return (
    <div className="merged-preview">
      <div className="agent-config-editor-status">
        <div className="agent-config-editor-status-copy">
          <span className="entry-badge">{formatAgentConfigLabel(format)}</span>
          <span className="entry-badge">Current file on disk</span>
        </div>
      </div>
      <div className="agent-config-editor-surface merged-preview-surface">
        <AgentConfigReadonlyView
          ariaLabel="Current config file preview"
          content={content}
          format={format}
        />
      </div>
    </div>
  );
}
