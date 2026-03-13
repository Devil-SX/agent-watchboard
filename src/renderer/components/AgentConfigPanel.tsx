import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { AgentBadge } from "@renderer/components/AgentBadge";
import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { getLocationLabel, LocationBadge } from "@renderer/components/LocationBadge";
import type {
  AgentConfigDocument,
  AgentConfigEntry,
  AgentConfigFamily,
  AgentConfigPaneState,
  AgentPathLocation,
  DiagnosticsInfo
} from "@shared/schema";

type Props = {
  diagnostics: DiagnosticsInfo | null;
  viewState: AgentConfigPaneState;
  onViewStateChange: (state: AgentConfigPaneState) => void;
};

export function AgentConfigPanel({ diagnostics, viewState, onViewStateChange }: Props): ReactElement {
  const [activeConfigId, setActiveConfigId] = useState<string>(viewState.activeConfigId);
  const [location, setLocation] = useState<AgentPathLocation>(viewState.location);
  const [familyFilter, setFamilyFilter] = useState<"all" | AgentConfigFamily>(viewState.familyFilter);
  const [entries, setEntries] = useState<AgentConfigEntry[]>([]);
  const [originalContent, setOriginalContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const persistReadyRef = useRef(false);

  const isWindows = diagnostics?.platform === "win32";
  const visibleEntries = useMemo(
    () => entries.filter((entry) => familyFilter === "all" || entry.family === familyFilter),
    [entries, familyFilter]
  );
  const activeEntry = entries.find((entry) => entry.id === activeConfigId) ?? null;
  const isDirty = editContent !== originalContent;

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
      activeConfigId: activeConfigId === "codex-config" || activeConfigId === "codex-auth" || activeConfigId === "claude-settings"
        ? activeConfigId
        : "codex-config"
    });
  }, [activeConfigId, familyFilter, location, onViewStateChange]);

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
              <div className="entry-context-strip is-compact">
                <AgentBadge agent={activeEntry.family} tone="strong" />
                <LocationBadge location={activeEntry.location} tone="strong" />
                <span className="entry-context-copy">{getLocationLabel(activeEntry.location)} config source</span>
              </div>
              <span className="entry-meta-label">Entry</span>
              <code>{activeEntry.entryPath}</code>
              {activeEntry.resolvedPath !== activeEntry.entryPath ? <span className="entry-meta-label">Resolved</span> : null}
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
