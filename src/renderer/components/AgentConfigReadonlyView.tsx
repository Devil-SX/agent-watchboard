import { useMemo, type ReactElement } from "react";

import { highlightAgentConfigContent } from "@renderer/components/agentConfigEditor";
import type { AgentConfigFormat } from "@shared/schema";

type Props = {
  content: string;
  format: AgentConfigFormat;
  ariaLabel: string;
  className?: string;
};

export function AgentConfigReadonlyView({ content, format, ariaLabel, className = "" }: Props): ReactElement {
  const highlightedContent = useMemo(() => highlightAgentConfigContent(content, format), [content, format]);

  return (
    <pre
      tabIndex={0}
      aria-label={ariaLabel}
      className={["agent-config-readonly", className].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: highlightedContent || " " }}
    />
  );
}
