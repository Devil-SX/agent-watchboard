import type { ReactElement } from "react";

import { ClaudeIcon, CodexIcon } from "@renderer/components/IconButton";
import type { AgentConfigFamily, PresetAgent } from "@shared/schema";

type AgentBadgeProps = {
  agent: AgentConfigFamily | PresetAgent;
  tone?: "default" | "strong";
  showLabel?: boolean;
};

export function AgentBadge({ agent, tone = "default", showLabel = true }: AgentBadgeProps): ReactElement {
  const className = ["agent-badge", `is-${agent}`, tone === "strong" ? "is-strong" : ""].filter(Boolean).join(" ");

  return (
    <span className={className}>
      <span className="agent-badge-icon" aria-hidden="true">
        {agent === "codex" ? <CodexIcon /> : <ClaudeIcon />}
      </span>
      {showLabel ? <span>{getAgentLabel(agent)}</span> : null}
    </span>
  );
}

export function getAgentLabel(agent: AgentConfigFamily | PresetAgent): string {
  return agent === "codex" ? "Codex" : "Claude";
}
