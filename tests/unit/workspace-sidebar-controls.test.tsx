import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkspaceSidebar } from "../../src/renderer/components/WorkspaceSidebar";
import { createEmptyWorkbenchDocument, createWorkspaceTemplate } from "../../src/shared/schema";

const styles = readFileSync(new URL("../../src/renderer/styles.css", import.meta.url), "utf8");

test("WorkspaceSidebar uses icon-led compact filter controls without visible field labels", () => {
  const codexWorkspace = createWorkspaceTemplate("Codex Workspace", { platform: "linux" });
  codexWorkspace.terminals = [
    {
      ...codexWorkspace.terminals[0]!,
      target: "wsl",
      startupMode: "custom",
      startupCustomCommand: "codex",
      startupCommand: "codex"
    }
  ];

  const html = renderToStaticMarkup(
    <WorkspaceSidebar
      workspaces={[codexWorkspace]}
      selectedWorkspaceId={codexWorkspace.id}
      activePaneId={null}
      workbench={createEmptyWorkbenchDocument()}
      sessions={{}}
      cronCountdownByInstanceId={new Map()}
      sortMode="alphabetical"
      filterMode="codex"
      environmentFilterMode="wsl"
      instanceVisibilityFilterEnabled={false}
      collapsedPathGroups={{}}
      isDeleteMode={false}
      selectedDeleteIds={[]}
      onCreateWorkspace={() => undefined}
      onSortModeChange={() => undefined}
      onFilterModeChange={() => undefined}
      onEnvironmentFilterModeChange={() => undefined}
      onInstanceVisibilityFilterChange={() => undefined}
      onCollapsedPathGroupsChange={() => undefined}
      onToggleDeleteMode={() => undefined}
      onCancelDeleteMode={() => undefined}
      onDeleteSelected={() => undefined}
      onToggleDeleteSelection={() => undefined}
      onSelectWorkspace={() => undefined}
      onFocusPane={() => undefined}
      onClosePane={() => undefined}
      onCollapsePane={() => undefined}
      onRestorePane={() => undefined}
      getSessionBacklogPreview={() => ""}
    />
  );

  assert.match(html, /aria-label="Sort workspaces: alphabetical"/);
  assert.match(html, /aria-label="Filter workspaces by agent"/);
  assert.match(html, /aria-label="Filter workspaces by environment"/);
  assert.match(html, /aria-label="Show all templates"/);
  assert.match(html, /compact-control-icon/);
  assert.match(html, /agent-badge-icon/);
  assert.match(html, /location-badge-icon/);
  assert.doesNotMatch(html, />Sort<\/span>/);
  assert.doesNotMatch(html, />Agent<\/span>/);
  assert.doesNotMatch(html, />Env<\/span>/);
  assert.doesNotMatch(html, />Instance<\/span>/);
});

test("WorkspaceSidebar path labels wrap instead of widening the sidebar", () => {
  assert.match(
    styles,
    /\.workspace-path-row\s*\{[^}]*align-items:\s*flex-start;/s
  );
  assert.match(
    styles,
    /\.workspace-path-label\s*\{[^}]*display:\s*block;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s
  );
  assert.match(
    styles,
    /\.workspace-list-row\s*\{[^}]*align-items:\s*flex-start;/s
  );
  assert.match(
    styles,
    /\.workspace-list-main\s*\{[^}]*align-items:\s*flex-start;/s
  );
  assert.match(
    styles,
    /\.workspace-list-copy span\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s
  );
  assert.doesNotMatch(
    styles,
    /\.workspace-path-label\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s
  );
});

test("WorkspaceSidebar template rows use a horizontal environment badge and compact launch flags", () => {
  const workspace = createWorkspaceTemplate("Codex Workspace", { platform: "linux" });
  workspace.terminals = [
    {
      ...workspace.terminals[0]!,
      target: "wsl",
      startupMode: "preset",
      startupPresetId: "codex-resume-last-skip-dangerous",
      cron: {
        enabled: true,
        intervalMinutes: 30,
        prompt: "sync findings"
      }
    }
  ];

  const html = renderToStaticMarkup(
    <WorkspaceSidebar
      workspaces={[workspace]}
      selectedWorkspaceId={workspace.id}
      activePaneId={null}
      workbench={createEmptyWorkbenchDocument()}
      sessions={{}}
      cronCountdownByInstanceId={new Map()}
      sortMode="alphabetical"
      filterMode="all"
      environmentFilterMode="all"
      instanceVisibilityFilterEnabled={false}
      collapsedPathGroups={{}}
      isDeleteMode={false}
      selectedDeleteIds={[]}
      onCreateWorkspace={() => undefined}
      onSortModeChange={() => undefined}
      onFilterModeChange={() => undefined}
      onEnvironmentFilterModeChange={() => undefined}
      onInstanceVisibilityFilterChange={() => undefined}
      onCollapsedPathGroupsChange={() => undefined}
      onToggleDeleteMode={() => undefined}
      onCancelDeleteMode={() => undefined}
      onDeleteSelected={() => undefined}
      onToggleDeleteSelection={() => undefined}
      onSelectWorkspace={() => undefined}
      onFocusPane={() => undefined}
      onClosePane={() => undefined}
      onCollapsePane={() => undefined}
      onRestorePane={() => undefined}
      getSessionBacklogPreview={() => ""}
    />
  );

  assert.match(html, /workspace-template-heading/);
  assert.match(html, /workspace-template-flags/);
  assert.match(html, />WSL<\/span>/);
  assert.match(html, /<strong>Codex Workspace<\/strong>/);
  assert.match(html, /workspace-template-flag">Continue<\/span>/);
  assert.match(html, /workspace-template-flag">Skip<\/span>/);
  assert.match(html, /workspace-template-flag">Cron<\/span>/);
  assert.doesNotMatch(html, /workspace-env-rail/);
  assert.doesNotMatch(html, /is-vertical-compact/);
  assert.doesNotMatch(html, /WSL\s*[·-]\s*Codex/i);
  assert.doesNotMatch(html, /Codex \+ Continue \+ Skip/);
});

test("WorkspaceSidebar keeps the dense horizontal template layout and tighter runtime rows in CSS", () => {
  assert.match(
    styles,
    /\.workspace-identity-stack\s*\{[^}]*justify-content:\s*center;[^}]*width:\s*24px;[^}]*flex:\s*0 0 24px;/s
  );
  assert.match(
    styles,
    /\.workspace-template-flags\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*4px;/s
  );
  assert.match(
    styles,
    /\.workspace-template-flag\s*\{[^}]*border-radius:\s*999px;[^}]*font-size:\s*0\.72rem;/s
  );
  assert.match(
    styles,
    /\.workspace-instance-item\s*\{[^}]*gap:\s*7px;[^}]*padding:\s*6px 9px;/s
  );
  assert.doesNotMatch(styles, /\.workspace-env-rail\s*\{/);
});
