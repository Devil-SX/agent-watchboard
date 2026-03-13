import { useEffect, useState, type ReactElement } from "react";

import { AGENT_CONFIG_FILES } from "@shared/schema";

type ConfigFileEntry = (typeof AGENT_CONFIG_FILES)[number];

export function AgentConfigPanel(): ReactElement {
  const [activeConfigId, setActiveConfigId] = useState<string>(AGENT_CONFIG_FILES[0].id);
  const [originalContent, setOriginalContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeEntry = AGENT_CONFIG_FILES.find((c) => c.id === activeConfigId) as ConfigFileEntry;
  const isDirty = editContent !== originalContent;

  useEffect(() => {
    setError("");
    void window.watchboard.readAgentConfig(activeConfigId).then((content) => {
      setOriginalContent(content);
      setEditContent(content);
    });
  }, [activeConfigId]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await window.watchboard.writeAgentConfig(activeConfigId, editContent);
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
      </header>

      <nav className="agent-config-tabs">
        {AGENT_CONFIG_FILES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={entry.id === activeConfigId ? "agent-config-tab is-active" : "agent-config-tab"}
            onClick={() => setActiveConfigId(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {error ? <div className="toolbar-error">{error}</div> : null}

      <div className="agent-config-editor">
        <textarea
          className="agent-config-textarea"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          spellCheck={false}
        />
      </div>

      <footer className="agent-config-footer">
        <div className="agent-config-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!isDirty || saving}
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
        <span className="agent-config-path">{activeEntry.path}</span>
      </footer>
    </div>
  );
}
