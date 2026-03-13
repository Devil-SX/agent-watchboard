import { useEffect, useMemo, useState, type ReactElement } from "react";

import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { ClaudeIcon, CodexIcon } from "@renderer/components/IconButton";
import type { AgentConfigDocument, AgentConfigEntry, AgentConfigFamily, AgentPathLocation, DiagnosticsInfo } from "@shared/schema";

export function AgentConfigPanel(): ReactElement {
  const [activeConfigId, setActiveConfigId] = useState<string>("codex-config");
  const [location, setLocation] = useState<AgentPathLocation>("host");
  const [familyFilter, setFamilyFilter] = useState<"all" | AgentConfigFamily>("all");
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);
  const [entries, setEntries] = useState<AgentConfigEntry[]>([]);
  const [originalContent, setOriginalContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const isWindows = diagnostics?.platform === "win32";
  const visibleEntries = useMemo(
    () => entries.filter((entry) => familyFilter === "all" || entry.family === familyFilter),
    [entries, familyFilter]
  );
  const activeEntry = entries.find((entry) => entry.id === activeConfigId) ?? null;
  const isDirty = editContent !== originalContent;

  useEffect(() => {
    void window.watchboard.getDiagnostics().then(setDiagnostics);
  }, []);

  useEffect(() => {
    setLoading(true);
    void window.watchboard.listAgentConfigs(location).then((nextEntries) => {
      setEntries(nextEntries);
      setLoading(false);
      if (!nextEntries.some((entry) => entry.id === activeConfigId)) {
        setActiveConfigId(nextEntries[0]?.id ?? "");
      }
    });
  }, [activeConfigId, location]);

  useEffect(() => {
    if (!activeConfigId) {
      setOriginalContent("");
      setEditContent("");
      return;
    }
    setError("");
    void window.watchboard.readAgentConfig(activeConfigId, location).then((document: AgentConfigDocument) => {
      setOriginalContent(document.content);
      setEditContent(document.content);
    });
  }, [activeConfigId, location]);

  useEffect(() => {
    if (visibleEntries.some((entry) => entry.id === activeConfigId)) {
      return;
    }
    setActiveConfigId(visibleEntries[0]?.id ?? "");
  }, [activeConfigId, visibleEntries]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await window.watchboard.writeAgentConfig(activeConfigId, location, editContent);
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
        <div className="agent-config-toolbar">
          {isWindows ? (
            <CompactToggleButton
              label="Path"
              value={location === "host" ? "Host" : "WSL"}
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
        </div>
      </header>

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
      {loading ? <div className="panel-empty"><p>Loading configs...</p></div> : null}

      <div className="agent-config-editor">
        <textarea
          className="agent-config-textarea"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          spellCheck={false}
          disabled={!activeEntry}
        />
      </div>

      <footer className="agent-config-footer">
        <div className="agent-config-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!activeEntry || !isDirty || saving}
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
        <div className="entry-meta is-compact">
          {activeEntry ? (
            <>
              <span>{activeEntry.location === "host" ? "Host" : "WSL"}</span>
              <code>{activeEntry.entryPath}</code>
              {activeEntry.resolvedPath !== activeEntry.entryPath ? <code>{activeEntry.resolvedPath}</code> : null}
            </>
          ) : (
            <span className="agent-config-path">No config matches the current filter.</span>
          )}
        </div>
      </footer>
    </div>
  );
}
