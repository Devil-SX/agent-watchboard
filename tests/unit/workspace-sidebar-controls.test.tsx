import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkspaceSidebar } from "../../src/renderer/components/WorkspaceSidebar";
import { createEmptyWorkbenchDocument, createWorkspaceTemplate } from "../../src/shared/schema";

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
