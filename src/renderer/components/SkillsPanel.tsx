import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { AgentBadge } from "@renderer/components/AgentBadge";
import { ChatPromptEditor } from "@renderer/components/ChatPromptEditor";
import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { ClaudeIcon, CodexIcon } from "@renderer/components/IconButton";
import { getLocationLabel, LocationBadge } from "@renderer/components/LocationBadge";
import { hasSkillsPaneScanStateChanged } from "@renderer/components/skillsPaneScanDiff";
import { type SkillsPaneScanState } from "@renderer/components/skillsPaneScanState";
import { SkillListItemContent } from "@renderer/components/SkillListItemContent";
import { SkillMarkdownDocument } from "@renderer/components/SkillMarkdownDocument";
import { TerminalTabView } from "@renderer/components/TerminalTabView";
import { type SkillsChatAgent } from "@renderer/components/skillsChatSession";
import { type TerminalViewState } from "@renderer/components/terminalViewState";
import { areSkillsPaneStatesEqual } from "@renderer/components/settingsDraft";
import { recordSkillsPaneAutosaveAttempt } from "@renderer/components/skillsPaneSafety";
import {
  type AgentPathLocation,
  type AppSettings,
  type ClaudeSubtypeFilter,
  type DiagnosticsInfo,
  type SessionState,
  type SkillFamilyFilter,
  type SkillEntry,
  type SkillsPaneState,
  type TerminalInstance
} from "@shared/schema";

type Props = {
  settings: AppSettings;
  sessions: Record<string, SessionState>;
  diagnostics: DiagnosticsInfo | null;
  viewState: SkillsPaneState;
  chatInstance: TerminalInstance | null;
  chatError: string;
  getSessionBacklog: (sessionId: string) => string;
  getTerminalViewState: (sessionId: string) => TerminalViewState | null;
  attachSessionBacklog: (sessionId: string) => Promise<string>;
  onTerminalViewStateChange: (sessionId: string, state: TerminalViewState) => void;
  onViewStateChange: (state: SkillsPaneState) => void;
  onScanStateChange: (state: SkillsPaneScanState) => void;
};

export function SkillsPanel({
  settings,
  sessions,
  diagnostics: diagnosticsProp,
  viewState,
  chatInstance,
  chatError,
  getSessionBacklog,
  getTerminalViewState,
  attachSessionBacklog,
  onTerminalViewStateChange,
  onViewStateChange,
  onScanStateChange
}: Props): ReactElement {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [selectedSkillPath, setSelectedSkillPath] = useState<string | null>(viewState.selectedSkillMdPath);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [location, setLocation] = useState<AgentPathLocation>(viewState.location);
  const [familyFilter, setFamilyFilter] = useState<SkillFamilyFilter>(viewState.familyFilter);
  const [claudeSubtypeFilter, setClaudeSubtypeFilter] = useState<ClaudeSubtypeFilter>(viewState.claudeSubtypeFilter);
  const [isChatOpen, setIsChatOpen] = useState(viewState.isChatOpen);
  const [chatAgent, setChatAgent] = useState<SkillsChatAgent>(viewState.chatAgent);
  const [chatPrompts, setChatPrompts] = useState(viewState.chatPrompts);
  const [loadError, setLoadError] = useState("");
  const [loadWarning, setLoadWarning] = useState("");
  const [contentError, setContentError] = useState("");
  const [syncWarning, setSyncWarning] = useState("");
  const persistReadyRef = useRef(false);
  const isApplyingViewStateRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const autosaveTimestampsRef = useRef<number[]>([]);
  const listRequestIdRef = useRef(0);
  const contentRequestIdRef = useRef(0);
  const prevScanStateRef = useRef<SkillsPaneScanState>({
    location,
    isLoading: false,
    error: "",
    warning: "",
    warningCode: null
  });
  const onScanStateChangeRef = useRef(onScanStateChange);
  onScanStateChangeRef.current = onScanStateChange;

  function emitScanState(next: SkillsPaneScanState): void {
    if (hasSkillsPaneScanStateChanged(prevScanStateRef.current, next)) {
      prevScanStateRef.current = next;
      onScanStateChangeRef.current(next);
    }
  }

  const isWindows = diagnosticsProp?.platform === "win32";

  const currentPaneState: SkillsPaneState = {
    location,
    familyFilter,
    claudeSubtypeFilter,
    selectedSkillMdPath: selectedSkillPath,
    isChatOpen,
    chatAgent,
    chatPrompts
  };

  useEffect(() => {
    isApplyingViewStateRef.current = true;
    setLocation(viewState.location);
    setFamilyFilter(viewState.familyFilter);
    setClaudeSubtypeFilter(viewState.claudeSubtypeFilter);
    setSelectedSkillPath(viewState.selectedSkillMdPath);
    setIsChatOpen(viewState.isChatOpen);
    setChatAgent(viewState.chatAgent);
    setChatPrompts(viewState.chatPrompts);
    setSyncWarning("");
  }, [viewState]);

  useEffect(() => {
    const requestId = ++listRequestIdRef.current;
    setLoading(true);
    setLoadError("");
    setLoadWarning("");
    emitScanState({
      location,
      isLoading: true,
      error: "",
      warning: "",
      warningCode: null
    });
    void window.watchboard
      .listSkills(location, { forceRefresh: reloadVersion > 0 })
      .then((result) => {
        if (listRequestIdRef.current !== requestId) {
          return;
        }
        setSkills(result.entries);
        setLoadWarning(result.warning ?? "");
        emitScanState({
          location,
          isLoading: false,
          error: "",
          warning: result.warning ?? "",
          warningCode: result.warningCode
        });
      })
      .catch((error: unknown) => {
        if (listRequestIdRef.current !== requestId) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
        emitScanState({
          location,
          isLoading: false,
          error: message,
          warning: "",
          warningCode: null
        });
      })
      .finally(() => {
        if (listRequestIdRef.current !== requestId) {
          return;
        }
        setLoading(false);
      });
  }, [location, reloadVersion]);

  useEffect(() => {
    const selectedSkill = skills.find((entry) => entry.skillMdPath === selectedSkillPath) ?? null;
    if (!selectedSkill) {
      setContent("");
      setContentError("");
      return;
    }
    const requestId = ++contentRequestIdRef.current;
    setContentError("");
    void window.watchboard
      .readSkillContent(selectedSkill.skillMdPath)
      .then((nextContent) => {
        if (contentRequestIdRef.current !== requestId) {
          return;
        }
        setContent(nextContent);
      })
      .catch((error: unknown) => {
        if (contentRequestIdRef.current !== requestId) {
          return;
        }
        setContent("");
        setContentError(error instanceof Error ? error.message : String(error));
      });
  }, [selectedSkillPath, skills]);

  const codexCount = skills.filter((s) => s.source === "codex").length;
  const claudeCount = skills.filter((s) => s.source === "claude-command" || s.source === "claude-skill").length;
  const otherCount = skills.filter((s) => s.source !== "codex" && s.source !== "claude-command" && s.source !== "claude-skill").length;
  const visibleSkills = useMemo(
    () => skills.filter((skill) => matchesSkillFilter(skill, familyFilter, claudeSubtypeFilter)),
    [claudeSubtypeFilter, familyFilter, skills]
  );
  const selectedSkill = useMemo(
    () => skills.find((entry) => entry.skillMdPath === selectedSkillPath) ?? null,
    [selectedSkillPath, skills]
  );

  useEffect(() => {
    if (!selectedSkillPath) {
      return;
    }
    const stillVisible = visibleSkills.some((entry) => entry.skillMdPath === selectedSkillPath);
    if (!stillVisible) {
      setSelectedSkillPath(null);
      setContent("");
    }
  }, [selectedSkillPath, visibleSkills]);

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
    if (areSkillsPaneStatesEqual(currentPaneState, viewState)) {
      if (isApplyingViewStateRef.current) {
        isApplyingViewStateRef.current = false;
      }
      return;
    }
    if (isApplyingViewStateRef.current) {
      return;
    }
    if (syncWarning) {
      return;
    }
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      const autosaveResult = recordSkillsPaneAutosaveAttempt(autosaveTimestampsRef.current);
      autosaveTimestampsRef.current = autosaveResult.nextAttemptTimestamps;
      if (autosaveResult.shouldPause) {
        setSyncWarning("Skills pane auto-sync paused after repeated rapid updates. Refresh the page state before continuing.");
        void window.watchboard.debugLog("skills-pane-autosave-paused", {
          paneState: currentPaneState,
          eventCount: autosaveResult.nextAttemptTimestamps.length
        });
        return;
      }
      void onViewStateChange(currentPaneState);
    }, 200);
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [
    chatAgent,
    chatPrompts,
    claudeSubtypeFilter,
    familyFilter,
    isChatOpen,
    location,
    onViewStateChange,
    selectedSkillPath,
    syncWarning,
    viewState
  ]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="skills-panel">
        <div className="panel-empty panel-empty-large">
          <p>Loading skills...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="skills-panel">
      <header className="skills-panel-header">
        <div className="skills-panel-header-copy">
          <p className="panel-eyebrow">Skills</p>
          <div className="skills-panel-stats" aria-label="Skill source statistics">
            {codexCount > 0 ? <SkillStatPill family="codex" label="Codex" count={codexCount} /> : null}
            {claudeCount > 0 ? <SkillStatPill family="claude" label="Claude" count={claudeCount} /> : null}
            {otherCount > 0 ? <SkillStatPill family="other" label="Other" count={otherCount} /> : null}
          </div>
        </div>
        <div className="skills-panel-toolbar">
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
          {familyFilter === "claude" ? (
            <CompactDropdown
              label="Claude"
              value={claudeSubtypeFilter}
              options={[
                { label: "All", value: "all" },
                { label: "Commands", value: "commands" },
                { label: "Skills", value: "skills" }
              ]}
              onChange={setClaudeSubtypeFilter}
            />
          ) : null}
          <button type="button" className="secondary-button" disabled={loading} onClick={() => setReloadVersion((current) => current + 1)}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
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
      {loadError ? <div className="toolbar-error">{loadError}</div> : null}
      {loadWarning ? <div className="toolbar-error">{loadWarning}</div> : null}
      {syncWarning ? <div className="toolbar-error">{syncWarning}</div> : null}

      <div className={isChatOpen ? "skills-panel-body has-chat" : "skills-panel-body"}>
        <div className="skills-list" role="list">
          {visibleSkills.map((skill) => {
            const isSelected = selectedSkill?.skillMdPath === skill.skillMdPath;
            return (
              <button
                key={skill.skillMdPath}
                type="button"
                className={isSelected ? "skills-list-item is-active" : "skills-list-item"}
                onClick={() => setSelectedSkillPath(skill.skillMdPath)}
              >
                <SkillListItemContent skill={skill} />
                {skill.isSymlink ? <span className="entry-badge">Softlink</span> : null}
              </button>
            );
          })}
          {skills.length === 0 ? (
            <div className="panel-empty skills-list-empty">
              <p>No skills found.</p>
              <span>Add one under ~/.codex/skills/, ~/.claude/commands/, or ~/.claude/skills/, then click Refresh.</span>
            </div>
          ) : visibleSkills.length === 0 ? (
            <div className="panel-empty skills-list-empty">
              <p>No skills match the current filters.</p>
            </div>
          ) : null}
        </div>

        <div className="skills-content">
          {selectedSkill ? (
            <>
              <div className="skills-content-header">
                <div className="entry-title-stack">
                  <div className="entry-title-row">
                    <span className="skills-list-icon">
                      {selectedSkill.source === "codex" ? <CodexIcon /> : <ClaudeIcon />}
                    </span>
                    <strong>{selectedSkill.name}</strong>
                    {selectedSkill.isSymlink ? <span className="entry-badge">Softlink</span> : null}
                  </div>
                  <div className="entry-context-strip">
                    <AgentBadge agent={selectedSkill.source === "codex" ? "codex" : "claude"} tone="strong" />
                    <LocationBadge location={selectedSkill.location} tone="strong" />
                    <span className="entry-context-copy">{getLocationLabel(selectedSkill.location)} skill source</span>
                  </div>
                </div>
              </div>
              <div className="entry-meta">
                <span className="entry-meta-label">Entry</span>
                <code>{selectedSkill.entryPath}</code>
                {selectedSkill.resolvedPath !== selectedSkill.entryPath ? <span className="entry-meta-label">Resolved</span> : null}
                {selectedSkill.resolvedPath !== selectedSkill.entryPath ? <code>{selectedSkill.resolvedPath}</code> : null}
              </div>
              {contentError ? (
                <div className="panel-empty panel-empty-large">
                  <p>Failed to load skill content.</p>
                  <span>{contentError}</span>
                </div>
              ) : content ? (
                <SkillMarkdownDocument content={content} />
              ) : (
                <pre className="skills-content-body">(empty)</pre>
              )}
            </>
          ) : skills.length === 0 ? (
            <div className="panel-empty panel-empty-large">
              <p>No skills loaded yet.</p>
              <span>Use Refresh after adding a new skill entry.</span>
            </div>
          ) : (
            <div className="panel-empty panel-empty-large">
              <p>Select a skill to view its content.</p>
            </div>
          )}
        </div>

        {isChatOpen && chatInstance ? (
          <div className="skills-chat-panel">
            <div className="skills-chat-header">
              <div className="skills-chat-title">
                <span className="skills-list-icon">{chatAgent === "codex" ? <CodexIcon /> : <ClaudeIcon />}</span>
                <strong>{chatAgent === "codex" ? "Codex Chat" : "Claude Chat"}</strong>
              </div>
              <button type="button" className="secondary-button skills-chat-close" onClick={() => setIsChatOpen(false)}>
                Hide
              </button>
            </div>
            <div className="entry-meta">
              <span className="entry-meta-label">Scope</span>
              <code>Scoped utility session in ~</code>
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

function SkillStatPill({
  family,
  label,
  count
}: {
  family: "codex" | "claude" | "other";
  label: string;
  count: number;
}): ReactElement {
  return (
    <span className={`skill-stat-pill is-${family}`}>
      <span className="skill-stat-pill-icon" aria-hidden="true">
        {family === "codex" ? <CodexIcon /> : family === "claude" ? <ClaudeIcon /> : <SkillClusterIcon />}
      </span>
      <span className="skill-stat-pill-label">{label}</span>
      <strong className="skill-stat-pill-count">{count}</strong>
    </span>
  );
}

function SkillClusterIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" role="presentation">
      <path
        d="M7.5 6.5a2 2 0 1 0 0 .01ZM16.5 6.5a2 2 0 1 0 0 .01ZM12 15a2 2 0 1 0 0 .01Z"
        fill="currentColor"
      />
      <path
        d="M8.9 7.7 10.8 13M15.1 7.7 13.2 13M9.7 6.5h4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function matchesSkillFilter(skill: SkillEntry, familyFilter: SkillFamilyFilter, claudeSubtypeFilter: ClaudeSubtypeFilter): boolean {
  if (familyFilter === "codex") {
    return skill.source === "codex";
  }
  if (familyFilter === "claude") {
    if (claudeSubtypeFilter === "commands") {
      return skill.source === "claude-command";
    }
    if (claudeSubtypeFilter === "skills") {
      return skill.source === "claude-skill";
    }
    return skill.source === "claude-command" || skill.source === "claude-skill";
  }
  return true;
}
