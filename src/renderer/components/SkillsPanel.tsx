import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { AgentBadge } from "@renderer/components/AgentBadge";
import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { ClaudeIcon, CodexIcon } from "@renderer/components/IconButton";
import { getLocationLabel, LocationBadge } from "@renderer/components/LocationBadge";
import { SkillMarkdownDocument } from "@renderer/components/SkillMarkdownDocument";
import { TerminalTabView } from "@renderer/components/TerminalTabView";
import { createSkillsChatInstance, type SkillsChatAgent } from "@renderer/components/skillsChatSession";
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
  onViewStateChange: (state: SkillsPaneState) => void;
};

export function SkillsPanel({ settings, sessions, diagnostics: diagnosticsProp, viewState, onViewStateChange }: Props): ReactElement {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [selectedSkillPath, setSelectedSkillPath] = useState<string | null>(viewState.selectedSkillMdPath);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<AgentPathLocation>(viewState.location);
  const [familyFilter, setFamilyFilter] = useState<SkillFamilyFilter>(viewState.familyFilter);
  const [claudeSubtypeFilter, setClaudeSubtypeFilter] = useState<ClaudeSubtypeFilter>(viewState.claudeSubtypeFilter);
  const [isChatOpen, setIsChatOpen] = useState(viewState.isChatOpen);
  const [chatAgent, setChatAgent] = useState<SkillsChatAgent>(viewState.chatAgent);
  const [chatInstance, setChatInstance] = useState<TerminalInstance | null>(null);
  const [chatError, setChatError] = useState("");
  const chatRequestRef = useRef(0);
  const persistReadyRef = useRef(false);
  const isWindows = diagnosticsProp?.platform === "win32";

  useEffect(() => {
    setLoading(true);
    void window.watchboard.listSkills(location).then((entries) => {
      setSkills(entries);
      setLoading(false);
    });
  }, [location]);

  useEffect(() => {
    const selectedSkill = skills.find((entry) => entry.skillMdPath === selectedSkillPath) ?? null;
    if (!selectedSkill) {
      setContent("");
      return;
    }
    void window.watchboard.readSkillContent(selectedSkill.skillMdPath).then(setContent);
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
    let cancelled = false;
    const requestId = ++chatRequestRef.current;

    if (!isChatOpen) {
      const staleInstance = chatInstance;
      setChatInstance(null);
      setChatError("");
      if (staleInstance) {
        void window.watchboard.stopSession(staleInstance.sessionId).catch(() => undefined);
      }
      return () => {
        cancelled = true;
      };
    }

    const nextInstance = createSkillsChatInstance(chatAgent, location, diagnosticsProp?.platform);
    setChatInstance(nextInstance);
    setChatError("");

    void window.watchboard.startSession(nextInstance).catch((error) => {
      if (cancelled || chatRequestRef.current !== requestId) {
        return;
      }
      setChatError(error instanceof Error ? error.message : String(error));
    });

    const previousInstance = chatInstance;
    if (previousInstance && previousInstance.sessionId !== nextInstance.sessionId) {
      void window.watchboard.stopSession(previousInstance.sessionId).catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [chatAgent, diagnosticsProp?.platform, isChatOpen, location]);

  useEffect(() => {
    return () => {
      if (!chatInstance) {
        return;
      }
      void window.watchboard.stopSession(chatInstance.sessionId).catch(() => undefined);
    };
  }, [chatInstance]);

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
    onViewStateChange({
      location,
      familyFilter,
      claudeSubtypeFilter,
      selectedSkillMdPath: selectedSkillPath,
      isChatOpen,
      chatAgent
    });
  }, [chatAgent, claudeSubtypeFilter, familyFilter, isChatOpen, location, onViewStateChange, selectedSkillPath]);

  if (loading) {
    return (
      <div className="skills-panel">
        <div className="panel-empty panel-empty-large">
          <p>Loading skills...</p>
        </div>
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="skills-panel">
        <div className="panel-empty panel-empty-large">
          <p>No skills found.</p>
          <span>Place skills in ~/.codex/skills/, ~/.claude/commands/, or ~/.claude/skills/</span>
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
                <span className="skills-list-icon">
                  {skill.source === "codex" ? <CodexIcon /> : <ClaudeIcon />}
                </span>
                <span className="skills-list-name">{skill.name}</span>
                {skill.isSymlink ? <span className="entry-badge">Softlink</span> : null}
              </button>
            );
          })}
          {visibleSkills.length === 0 ? (
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
              {content ? <SkillMarkdownDocument content={content} /> : <pre className="skills-content-body">(empty)</pre>}
            </>
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
            <div className="skills-chat-terminal">
              <TerminalTabView
                instance={chatInstance}
                session={sessions[chatInstance.sessionId] ?? null}
                settings={settings}
                isVisible
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
