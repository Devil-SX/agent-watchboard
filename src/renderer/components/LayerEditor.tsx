import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import {
  createIdleAgentConfigValidation,
  formatAgentConfigLabel,
  highlightAgentConfigContent,
  validateAgentConfigContent
} from "@renderer/components/agentConfigEditor";
import type { AgentConfigFileId, AgentConfigFormat, AgentPathLocation, ConfigLayer } from "@shared/schema";

type Props = {
  layer: ConfigLayer | null;
  configId: AgentConfigFileId;
  format: AgentConfigFormat;
  location: AgentPathLocation;
};

export function LayerEditor({ layer, configId, format, location }: Props): ReactElement {
  const [originalContent, setOriginalContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);

  const isDirty = editContent !== originalContent;
  const validation = useMemo(() => {
    if (!layer) return createIdleAgentConfigValidation(null, "Select a layer to edit.");
    if (loading) return createIdleAgentConfigValidation(format, "Loading layer...");
    return validateAgentConfigContent(editContent, format);
  }, [editContent, format, layer, loading]);
  const highlightedContent = useMemo(() => highlightAgentConfigContent(editContent, format), [editContent, format]);
  const tomlDeleteTitle = '["$watchboard"]\ndelete = ["path.to.key"]';
  const jsonDeleteSyntax = '"$watchboard": { "delete": ["path.to.key"] }';

  useEffect(() => {
    if (!layer) {
      setOriginalContent("");
      setEditContent("");
      return;
    }
    setLoading(true);
    setError("");
    void window.watchboard
      .readLayerContent(configId, layer.id, location)
      .then((content) => {
        setOriginalContent(content);
        setEditContent(content);
      })
      .catch((err: unknown) => {
        setOriginalContent("");
        setEditContent("");
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [configId, layer?.id, location]);

  function syncScroll(): void {
    if (!textareaRef.current || !highlightRef.current) return;
    highlightRef.current.scrollTop = textareaRef.current.scrollTop;
    highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
  }

  async function handleSave(): Promise<void> {
    if (!layer) return;
    setSaving(true);
    setError("");
    try {
      await window.watchboard.writeLayerContent(configId, layer.id, location, editContent);
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
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.scrollTop = 0;
      if (highlightRef.current) highlightRef.current.scrollTop = 0;
    });
  }

  if (!layer) {
    return (
      <div className="layer-editor-empty">
        <p>Select a layer from the list to edit its content.</p>
      </div>
    );
  }

  return (
    <div className="layer-editor">
      <div className="agent-config-editor-status">
        <div className="agent-config-editor-status-copy">
          <span className="entry-badge">{formatAgentConfigLabel(format)}</span>
          <span className="entry-badge">{layer.name}</span>
          {format === "json" ? <span className="entry-badge">Comments OK</span> : null}
          {format === "toml" ? (
            <span className="agent-config-delete-hint" title={`Delete layer keys with ${tomlDeleteTitle}`}>
              Delete keys: <code>["$watchboard"]</code> <code>delete = ["path.to.key"]</code>
            </span>
          ) : (
            <span className="agent-config-delete-hint" title={`Delete layer keys with ${jsonDeleteSyntax}`}>
              Delete keys: <code>{jsonDeleteSyntax}</code>
            </span>
          )}
          <span
            className={[
              "path-validation",
              validation.status === "valid" ? "is-valid" : validation.status === "invalid" ? "is-invalid" : "is-loading"
            ].join(" ")}
          >
            {validation.summary}
          </span>
        </div>
        {validation.detail ? <span className="agent-config-validation-detail">{validation.detail}</span> : null}
      </div>

      {error ? <div className="toolbar-error">{error}</div> : null}

      <div className="agent-config-editor-surface">
        <pre
          ref={highlightRef}
          aria-hidden="true"
          className="agent-config-highlight"
          dangerouslySetInnerHTML={{ __html: highlightedContent || " " }}
        />
        <textarea
          ref={textareaRef}
          className="agent-config-textarea"
          value={editContent}
          onChange={(e) => {
            setEditContent(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(event) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "s") {
              return;
            }
            event.preventDefault();
            if (!isDirty || saving || loading || !layer) {
              return;
            }
            void handleSave();
          }}
          onScroll={syncScroll}
          spellCheck={false}
          disabled={loading}
          wrap="off"
        />
      </div>

      <div className="layer-editor-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!isDirty || saving || loading}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving..." : "Save Layer"}
        </button>
        <button type="button" className="secondary-button" disabled={!isDirty || loading} onClick={handleDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
