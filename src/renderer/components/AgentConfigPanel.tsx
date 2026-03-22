import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { AgentBadge } from "@renderer/components/AgentBadge";
import {
  createIdleAgentConfigValidation,
  formatAgentConfigLabel,
  highlightAgentConfigContent,
  validateAgentConfigContent
} from "@renderer/components/agentConfigEditor";
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
  AgentConfigFileId,
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
  const [activeConfigId, setActiveConfigId] = useState<AgentConfigFileId>(viewState.activeConfigId);
  const [location, setLocation] = useState<AgentPathLocation>(viewState.location);
  const [familyFilter, setFamilyFilter] = useState<"all" | AgentConfigFamily>(viewState.familyFilter);
  const [isChatOpen, setIsChatOpen] = useState(viewState.isChatOpen);
  const [chatAgent, setChatAgent] = useState<SkillsChatAgent>(viewState.chatAgent);
  const [skipDangerous, setSkipDangerous] = useState(viewState.skipDangerous);
  const [chatPrompts, setChatPrompts] = useState(viewState.chatPrompts);
  const [entries, setEntries] = useState<AgentConfigEntry[]>([]);
  const [originalContent, setOriginalContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [saveWarning, setSaveWarning] = useState("");
  const [loading, setLoading] = useState(true);
  const persistReadyRef = useRef(false);
  const isApplyingViewStateRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);

  const isWindows = diagnostics?.platform === "win32";
  const visibleEntries = useMemo(
    () => entries.filter((entry) => familyFilter === "all" || entry.family === familyFilter),
    [entries, familyFilter]
  );
  const activeEntry = entries.find((entry) => entry.id === activeConfigId) ?? null;
  const activeFormat = activeEntry?.format ?? null;
  const isDirty = editContent !== originalContent;
  const validation = useMemo(() => {
    if (!activeFormat) {
      return createIdleAgentConfigValidation(null, "Select a config to inspect.");
    }
    if (reading) {
      return createIdleAgentConfigValidation(activeFormat, `Loading ${formatAgentConfigLabel(activeFormat)} config...`);
    }
    return validateAgentConfigContent(editContent, activeFormat);
  }, [activeFormat, editContent, reading]);
  const highlightedContent = useMemo(() => highlightAgentConfigContent(editContent, activeFormat), [activeFormat, editContent]);
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
    skipDangerous,
    chatPrompts
  };

  useEffect(() => {
    isApplyingViewStateRef.current = true;
    setLocation(viewState.location);
    setFamilyFilter(viewState.familyFilter);
    setActiveConfigId(viewState.activeConfigId);
    setIsChatOpen(viewState.isChatOpen);
    setChatAgent(viewState.chatAgent);
    setSkipDangerous(viewState.skipDangerous);
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
          setActiveConfigId(nextEntries[0]?.id ?? activeConfigId);
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
      setSaveWarning("");
      return;
    }
    setReading(true);
    setError("");
    void window.watchboard
      .readAgentConfig(activeConfigId, location)
      .then((document: AgentConfigDocument) => {
        setOriginalContent(document.content);
        setEditContent(document.content);
        setSaveWarning("");
      })
      .catch((readError: unknown) => {
        setOriginalContent("");
        setEditContent("");
        setError(readError instanceof Error ? readError.message : String(readError));
        setSaveWarning("");
      })
      .finally(() => {
        setReading(false);
      });
  }, [activeConfigId, location]);

  useEffect(() => {
    if (visibleEntries.length === 0) {
      return;
    }
    if (visibleEntries.some((entry) => entry.id === activeConfigId)) {
      return;
    }
    setActiveConfigId(visibleEntries[0]?.id ?? activeConfigId);
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
  }, [activeConfigId, chatAgent, skipDangerous, chatPrompts, currentPaneState, familyFilter, isChatOpen, location, onViewStateChange, viewState]);

  useEffect(() => {
    setSaveWarning("");
  }, [activeConfigId, location]);

  function syncEditorScroll(): void {
    if (!textareaRef.current || !highlightRef.current) {
      return;
    }
    highlightRef.current.scrollTop = textareaRef.current.scrollTop;
    highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
  }

  function handleEditContentChange(value: string): void {
    setEditContent(value);
    if (saveWarning) {
      setSaveWarning("");
    }
    if (error) {
      setError("");
    }
  }

  async function handleSave(): Promise<void> {
    if (!activeConfigId) {
      return;
    }
    if (validation.status === "invalid" && !saveWarning) {
      setSaveWarning(`Invalid ${formatAgentConfigLabel(validation.format)} syntax. Click Save again to write it anyway.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await window.watchboard.writeAgentConfig(activeConfigId, location, editContent);
      setOriginalContent(editContent);
      setSaveWarning("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard(): void {
    setEditContent(originalContent);
    setError("");
    setSaveWarning("");
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.scrollTop = 0;
        textareaRef.current.scrollLeft = 0;
      }
      if (highlightRef.current) {
        highlightRef.current.scrollTop = 0;
        highlightRef.current.scrollLeft = 0;
      }
    });
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
          {saveWarning ? <div className="toolbar-error">{saveWarning}</div> : null}
          {loading ? <div className="panel-empty"><p>Loading configs...</p></div> : null}

          <div className="agent-config-editor">
            <div className="agent-config-editor-status">
              <div className="agent-config-editor-status-copy">
                {activeFormat ? <span className="entry-badge">{formatAgentConfigLabel(activeFormat)}</span> : null}
                <span
                  className={[
                    "path-validation",
                    validation.status === "valid"
                      ? "is-valid"
                      : validation.status === "invalid"
                        ? "is-invalid"
                        : "is-loading"
                  ].join(" ")}
                >
                  {validation.summary}
                </span>
              </div>
              {validation.detail ? <span className="agent-config-validation-detail">{validation.detail}</span> : null}
            </div>
            <div className="agent-config-editor-surface">
              <pre
                ref={highlightRef}
                aria-hidden="true"
                className="agent-config-highlight"
                dangerouslySetInnerHTML={{ __html: highlightedContent || " " }}
              />
              <textarea
                ref={textareaRef}
                className="agent-config-textarea"
                value={editContent}
                onChange={(e) => handleEditContentChange(e.target.value)}
                onScroll={syncEditorScroll}
                spellCheck={false}
                disabled={!activeEntry || reading}
                wrap="off"
              />
            </div>
          </div>

          <footer className="agent-config-footer">
            <div className="agent-config-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!activeEntry || !isDirty || saving || reading}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving..." : validation.status === "invalid" && Boolean(saveWarning) ? "Save Anyway" : "Save"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!isDirty || reading}
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
