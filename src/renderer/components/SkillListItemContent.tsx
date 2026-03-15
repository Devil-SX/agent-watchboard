import type { ReactElement } from "react";

import { ClaudeIcon, CodexIcon } from "@renderer/components/IconButton";
import type { SkillEntry } from "@shared/schema";

export function SkillListItemContent({ skill }: { skill: SkillEntry }): ReactElement {
  return (
    <>
      <span className="skills-list-icon">
        {skill.source === "codex" ? <CodexIcon /> : <ClaudeIcon />}
      </span>
      <span className="skills-list-copy">
        <span className="skills-list-name">{skill.name}</span>
        {skill.description ? <span className="skills-list-description">{skill.description}</span> : null}
      </span>
    </>
  );
}
