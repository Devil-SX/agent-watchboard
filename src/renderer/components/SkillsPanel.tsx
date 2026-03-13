import { useEffect, useMemo, useState, type ReactElement } from "react";

import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { ClaudeIcon, CodexIcon } from "@renderer/components/IconButton";
import { getLocationLabel, LocationBadge } from "@renderer/components/LocationBadge";
import { SkillMarkdownDocument } from "@renderer/components/SkillMarkdownDocument";
import type { AgentPathLocation, DiagnosticsInfo, SkillEntry } from "@shared/schema";

type SkillFamilyFilter = "all" | "codex" | "claude";
type ClaudeSubtypeFilter = "all" | "commands" | "skills";

export function SkillsPanel(): ReactElement {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);
  const [location, setLocation] = useState<AgentPathLocation>("host");
  const [familyFilter, setFamilyFilter] = useState<SkillFamilyFilter>("all");
  const [claudeSubtypeFilter, setClaudeSubtypeFilter] = useState<ClaudeSubtypeFilter>("all");
  const isWindows = diagnostics?.platform === "win32";

  useEffect(() => {
    void window.watchboard.getDiagnostics().then(setDiagnostics);
  }, []);

  useEffect(() => {
    setLoading(true);
    void window.watchboard.listSkills(location).then((entries) => {
      setSkills(entries);
      setLoading(false);
    });
  }, [location]);

  useEffect(() => {
    if (!selectedSkill) {
      setContent("");
      return;
    }
    void window.watchboard.readSkillContent(selectedSkill.skillMdPath).then(setContent);
  }, [selectedSkill?.skillMdPath]);

  const codexCount = skills.filter((s) => s.source === "codex").length;
  const claudeCmdCount = skills.filter((s) => s.source === "claude-command").length;
  const claudeSkillCount = skills.filter((s) => s.source === "claude-skill").length;
  const visibleSkills = useMemo(
    () => skills.filter((skill) => matchesSkillFilter(skill, familyFilter, claudeSubtypeFilter)),
    [claudeSubtypeFilter, familyFilter, skills]
  );

  useEffect(() => {
    if (!selectedSkill) {
      return;
    }
    const stillVisible = visibleSkills.some((entry) => entry.skillMdPath === selectedSkill.skillMdPath);
    if (!stillVisible) {
      setSelectedSkill(null);
      setContent("");
    }
  }, [selectedSkill, visibleSkills]);

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
        <div>
          <p className="panel-eyebrow">Skills</p>
          <h2>
            codex: {codexCount} &middot; claude-cmd: {claudeCmdCount} &middot; claude-skill: {claudeSkillCount}
          </h2>
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
              { label: "Codex", value: "codex", icon: <CodexIcon /> },
              { label: "Claude", value: "claude", icon: <ClaudeIcon /> }
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
        </div>
      </header>

      <div className="skills-panel-body">
        <div className="skills-list" role="list">
          {visibleSkills.map((skill) => {
            const isSelected = selectedSkill?.skillMdPath === skill.skillMdPath;
            return (
              <button
                key={skill.skillMdPath}
                type="button"
                className={isSelected ? "skills-list-item is-active" : "skills-list-item"}
                onClick={() => setSelectedSkill(skill)}
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
      </div>
    </div>
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
