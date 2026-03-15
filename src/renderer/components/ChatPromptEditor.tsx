import { type ReactElement } from "react";

import { AgentBadge } from "@renderer/components/AgentBadge";
import { CompactDropdown } from "@renderer/components/CompactControls";
import type { ChatPrompt } from "@shared/schema";

type Props = {
  agent: "codex" | "claude";
  prompt: ChatPrompt;
  onPromptChange: (prompt: ChatPrompt) => void;
};

export function ChatPromptEditor({ agent, prompt, onPromptChange }: Props): ReactElement {
  const modeLabel = prompt.mode === "custom" ? "Custom" : "Default";

  return (
    <div className="chat-prompt-editor">
      <div className="chat-prompt-toolbar">
        <div className="chat-prompt-title">
          <span className="entry-meta-label">System Prompt</span>
          <AgentBadge agent={agent} tone="strong" />
        </div>
        <div className="chat-prompt-actions">
          <CompactDropdown
            label="Mode"
            value={prompt.mode}
            options={[
              { label: "Default", value: "default" },
              { label: "Custom", value: "custom" }
            ]}
            onChange={(mode) => {
              onPromptChange({
                ...prompt,
                mode
              });
            }}
          />
          {prompt.mode === "custom" ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onPromptChange({
                  mode: "default",
                  text: ""
                })}
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>
      <p className="chat-prompt-copy">
        {modeLabel} prompts apply on the next chat start. Running sessions keep their current startup instructions.
      </p>
      {prompt.mode === "custom" ? (
        <textarea
          className="chat-prompt-textarea"
          value={prompt.text}
          onChange={(event) =>
            onPromptChange({
              ...prompt,
              text: event.target.value
            })}
          spellCheck={false}
          placeholder={`Add startup instructions for ${agent === "codex" ? "Codex" : "Claude"} chat.`}
        />
      ) : null}
    </div>
  );
}
