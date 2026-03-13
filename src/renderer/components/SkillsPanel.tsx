import { useEffect, useState, type ReactElement } from "react";

import { ClaudeIcon, CodexIcon } from "@renderer/components/IconButton";
import type { SkillEntry } from "@shared/schema";

export function SkillsPanel(): ReactElement {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window.watchboard.listSkills().then((entries) => {
      setSkills(entries);
      setLoading(false);
    });
  }, []);

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
      </header>

      <div className="skills-panel-body">
        <div className="skills-list" role="list">
          {skills.map((skill) => {
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
              </button>
            );
          })}
        </div>

        <div className="skills-content">
          {selectedSkill ? (
            <>
              <div className="skills-content-header">
                <span className="skills-list-icon">
                  {selectedSkill.source === "codex" ? <CodexIcon /> : <ClaudeIcon />}
                </span>
                <strong>{selectedSkill.name}</strong>
              </div>
              <pre className="skills-content-body">{content || "(empty)"}</pre>
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
