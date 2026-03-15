import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { AgentBadge } from "@renderer/components/AgentBadge";
import { ChatPromptEditor } from "@renderer/components/ChatPromptEditor";
import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { ClaudeIcon, CodexIcon } from "@renderer/components/IconButton";
import { getLocationLabel, LocationBadge } from "@renderer/components/LocationBadge";
import { areAgentConfigPaneStatesEqual } from "@renderer/components/settingsDraft";
import { type SkillsChatAgent } from "@renderer/components/skillsChatSession";
import { TerminalTabView } from "@renderer/components/TerminalTabView";
import { type TerminalViewState } from "@renderer/components/terminalViewState";
import type {
  AgentConfigDocument,
  AgentConfigEntry,
  AgentConfigFamily,
  AgentConfigPaneState,
  AgentPathLocation,
  AppSettings,
  DiagnosticsInfo,
  SessionState,
  TerminalInstance
} from "@shared/schema";

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
  const [activeConfigId, setActiveConfigId] = useState<string>(viewState.activeConfigId);
  const [location, setLocation] = useState<AgentPathLocation>(viewState.location);
  const [familyFilter, setFamilyFilter] = useState<"all" | AgentConfigFamily>(viewState.familyFilter);
  const [isChatOpen, setIsChatOpen] = useState(viewState.isChatOpen);
  const [chatAgent, setChatAgent] = useState<SkillsChatAgent>(viewState.chatAgent);
  const [chatPrompts, setChatPrompts] = useState(viewState.chatPrompts);
  const [entries, setEntries] = useState<AgentConfigEntry[]>([]);
  const [originalContent, setOriginalContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const persistReadyRef = useRef(false);
  const isApplyingViewStateRef = useRef(false);

  const isWindows = diagnostics?.platform === "win32";
  const visibleEntries = useMemo(
    () => entries.filter((entry) => familyFilter === "all" || entry.family === familyFilter),
    [entries, familyFilter]
  );
  const activeEntry = entries.find((entry) => entry.id === activeConfigId) ?? null;
  const isDirty = editContent !== originalContent;
  const normalizedActiveConfigId =
    activeConfigId === "codex-config" || activeConfigId === "codex-auth" || activeConfigId === "claude-settings"
      ? activeConfigId
      : "codex-config";
  const currentPaneState: AgentConfigPaneState = {
    location,
    familyFilter,
    activeConfigId: normalizedActiveConfigId,
    isChatOpen,
    chatAgent,
    chatPrompts
  };

  useEffect(() => {
    isApplyingViewStateRef.current = true;
    setLocation(viewState.location);
    setFamilyFilter(viewState.familyFilter);
    setActiveConfigId(viewState.activeConfigId);
    setIsChatOpen(viewState.isChatOpen);
    setChatAgent(viewState.chatAgent);
    setChatPrompts(viewState.chatPrompts);
  }, [viewState]);

  useEffect(() => {
    setLoading(true);
    setError("");
    void window.watchboard
      .listAgentConfigs(location)
      .then((nextEntries) => {
        setEntries(nextEntries);
        if (!nextEntries.some((entry) => entry.id === activeConfigId)) {
          setActiveConfigId(nextEntries[0]?.id ?? "");
        }
      })
      .catch((loadError: unknown) => {
        setEntries([]);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeConfigId, location]);

  useEffect(() => {
    if (!activeConfigId) {
      setOriginalContent("");
      setEditContent("");
      return;
    }
    setError("");
    void window.watchboard
      .readAgentConfig(activeConfigId, location)
      .then((document: AgentConfigDocument) => {
        setOriginalContent(document.content);
        setEditContent(document.content);
      })
      .catch((readError: unknown) => {
        setOriginalContent("");
        setEditContent("");
        setError(readError instanceof Error ? readError.message : String(readError));
      });
  }, [activeConfigId, location]);

  useEffect(() => {
    if (visibleEntries.some((entry) => entry.id === activeConfigId)) {
      return;
    }
    setActiveConfigId(visibleEntries[0]?.id ?? "");
  }, [activeConfigId, visibleEntries]);

  useEffect(() => {
    if (isWindows) {
      return;
    }
    setLocation("host");
  }, [isWindows]);

  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    if (areAgentConfigPaneStatesEqual(currentPaneState, viewState)) {
      if (isApplyingViewStateRef.current) {
        isApplyingViewStateRef.current = false;
      }
      return;
    }
    if (isApplyingViewStateRef.current) {
      return;
    }
    void onViewStateChange(currentPaneState);
  }, [activeConfigId, chatAgent, chatPrompts, currentPaneState, familyFilter, isChatOpen, location, onViewStateChange, viewState]);

  async function handleSave(): Promise<void> {
    if (!activeConfigId) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await window.watchboard.writeAgentConfig(activeConfigId, location, editContent);
      setOriginalContent(editContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard(): void {
    setEditContent(originalContent);
    setError("");
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
          <CompactDropdown
            label="Filter"
            value={familyFilter}
            options={[
              { label: "All", value: "all" },
              { label: "Codex", value: "codex", content: <AgentBadge agent="codex" /> },
              { label: "Claude", value: "claude", content: <AgentBadge agent="claude" /> }
            ]}
            onChange={setFamilyFilter}
          />
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
        </div>
      </header>

      <div className={isChatOpen ? "agent-config-body has-chat" : "agent-config-body"}>
        <div className="agent-config-main">
          <nav className="agent-config-tabs">
            {visibleEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={entry.id === activeConfigId ? "agent-config-tab is-active" : "agent-config-tab"}
                onClick={() => setActiveConfigId(entry.id)}
              >
                {entry.label}
                {entry.isSymlink ? <span className="entry-badge">Softlink</span> : null}
              </button>
            ))}
          </nav>

          {error ? <div className="toolbar-error">{error}</div> : null}
          {loading ? <div className="panel-empty"><p>Loading configs...</p></div> : null}

          <div className="agent-config-editor">
            <textarea
              className="agent-config-textarea"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
              disabled={!activeEntry}
            />
          </div>

          <footer className="agent-config-footer">
            <div className="agent-config-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!activeEntry || !isDirty || saving}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!isDirty}
                onClick={handleDiscard}
              >
                Discard
              </button>
            </div>
            <div className="entry-meta is-compact">
              {activeEntry ? (
                <>
                  <div className="entry-context-strip is-compact">
                    <AgentBadge agent={activeEntry.family} tone="strong" />
                    <LocationBadge location={activeEntry.location} tone="strong" />
                    <span className="entry-context-copy">{getLocationLabel(activeEntry.location)} config source</span>
                  </div>
                  <span className="entry-meta-label">Entry</span>
                  <code>{activeEntry.entryPath}</code>
                  {activeEntry.resolvedPath !== activeEntry.entryPath ? <span className="entry-meta-label">Resolved</span> : null}
                  {activeEntry.resolvedPath !== activeEntry.entryPath ? <code>{activeEntry.resolvedPath}</code> : null}
                </>
              ) : (
                <span className="agent-config-path">No config matches the current filter.</span>
              )}
            </div>
          </footer>
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
