import {
  type FlexLayoutNode,
  type FlexLayoutRowNode,
  type FlexLayoutTabNode,
  type FlexLayoutTabSetNode,
  type TerminalInstance,
  type WorkbenchDocument,
  WorkbenchDocumentSchema,
  type WorkbenchLayoutModel,
  WorkbenchLayoutModelSchema,
  type WorkbenchOpenMode,
  createEmptyWorkbenchDocument,
  createEmptyWorkbenchLayoutModel,
  createWorkbenchLayoutModel,
  createWorkbenchTab,
  nowIso
} from "@shared/schema";

export function createInitialWorkbenchDocument(): WorkbenchDocument {
  return createEmptyWorkbenchDocument();
}

export function normalizeWorkbenchDocument(document: WorkbenchDocument): WorkbenchDocument {
  const instances = document.instances.map((instance) => ({ ...instance }));
  const layoutModel = normalizeWorkbenchLayoutModel(document.layoutModel, instances);
  const paneIds = new Set(instances.map((instance) => instance.paneId));
  const activePaneId =
    document.activePaneId && paneIds.has(document.activePaneId)
      ? document.activePaneId
      : instances[instances.length - 1]?.paneId ?? null;

  return WorkbenchDocumentSchema.parse({
    ...document,
    updatedAt: document.updatedAt ?? nowIso(),
    activePaneId,
    instances,
    layoutModel
  });
}

export function collapseInstance(document: WorkbenchDocument, instanceId: string): WorkbenchDocument {
  const base = normalizeWorkbenchDocument(document);
  const target = base.instances.find((instance) => instance.instanceId === instanceId);
  if (!target || target.collapsed) return base;

  const nextInstances = base.instances.map((instance) =>
    instance.instanceId === instanceId ? { ...instance, collapsed: true, updatedAt: nowIso() } : instance
  );
  const visibleInstances = nextInstances.filter((i) => !i.collapsed);
  const nextLayout = removePaneFromLayout(base.layoutModel, target.paneId, visibleInstances);
  const fallbackPaneId = base.activePaneId === target.paneId
    ? visibleInstances[visibleInstances.length - 1]?.paneId ?? null
    : base.activePaneId;

  return normalizeWorkbenchDocument({
    ...base,
    updatedAt: nowIso(),
    activePaneId: fallbackPaneId,
    instances: nextInstances,
    layoutModel: nextLayout
  });
}

export function restoreInstance(
  document: WorkbenchDocument,
  instanceId: string,
  openMode: WorkbenchOpenMode = "tab",
  anchorPaneId?: string | null
): WorkbenchDocument {
  const base = normalizeWorkbenchDocument(document);
  const target = base.instances.find((instance) => instance.instanceId === instanceId);
  if (!target || !target.collapsed) return base;

  const nextInstances = base.instances.map((instance) =>
    instance.instanceId === instanceId ? { ...instance, collapsed: false, updatedAt: nowIso() } : instance
  );
  const visibleInstances = nextInstances.filter((i) => !i.collapsed);
  let nextLayout: WorkbenchLayoutModel;
  if (visibleInstances.length === 1) {
    nextLayout = createWorkbenchLayoutModel(visibleInstances);
  } else {
    nextLayout = insertInstanceIntoLayout(base.layoutModel, target, openMode, anchorPaneId ?? base.activePaneId);
  }

  return normalizeWorkbenchDocument({
    ...base,
    updatedAt: nowIso(),
    activePaneId: target.paneId,
    instances: nextInstances,
    layoutModel: nextLayout
  });
}

export function attachExistingInstance(
  document: WorkbenchDocument,
  instanceId: string,
  openMode: WorkbenchOpenMode = "tab",
  anchorPaneId?: string | null
): WorkbenchDocument {
  const base = normalizeWorkbenchDocument(document);
  const target = base.instances.find((instance) => instance.instanceId === instanceId);
  if (!target) {
    return base;
  }
  if (target.collapsed) {
    return restoreInstance(base, instanceId, openMode, anchorPaneId);
  }

  const visibleInstances = base.instances.filter((instance) => !instance.collapsed);
  if (visibleInstances.length <= 1) {
    return updateWorkbenchActivePane(base, target.paneId);
  }

  const nextLayout = insertInstanceIntoLayout(
    removePaneFromLayout(base.layoutModel, target.paneId, base.instances),
    target,
    openMode,
    anchorPaneId ?? base.activePaneId
  );

  return normalizeWorkbenchDocument({
    ...base,
    updatedAt: nowIso(),
    activePaneId: target.paneId,
    layoutModel: nextLayout
  });
}

export function normalizeWorkbenchLayoutModel(
  layoutModel: WorkbenchLayoutModel,
  instances: TerminalInstance[]
): WorkbenchLayoutModel {
  const visibleInstances = instances.filter((i) => !i.collapsed);
  if (visibleInstances.length === 0) {
    return createEmptyWorkbenchLayoutModel();
  }

  const instanceMap = new Map(visibleInstances.map((instance) => [instance.instanceId, instance] as const));
  const seen = new Set<string>();
  let firstTabset: FlexLayoutTabSetNode | null = null;

  const normalizedRoot = normalizeRowNode(layoutModel.layout, instanceMap, seen, (tabset) => {
    if (!firstTabset) {
      firstTabset = tabset;
    }
  });

  if (!firstTabset) {
    return createWorkbenchLayoutModel(visibleInstances);
  }
  const targetTabset: FlexLayoutTabSetNode = firstTabset;

  for (const instance of visibleInstances) {
    if (!seen.has(instance.instanceId)) {
      targetTabset.children.push(createWorkbenchTab(instance));
    }
  }

  targetTabset.selected = clampSelectedIndex(targetTabset.selected, targetTabset.children.length);
  return WorkbenchLayoutModelSchema.parse({
    ...layoutModel,
    global: {
      ...layoutModel.global,
      tabSetEnableClose: false,
      tabEnableClose: false,
      tabEnableFloat: false,
      tabEnableRename: false
    },
    layout: normalizedRoot
  });
}

export function addInstanceToWorkbench(
  document: WorkbenchDocument,
  instance: TerminalInstance,
  openMode: WorkbenchOpenMode = "tab",
  anchorPaneId?: string | null
): WorkbenchDocument {
  const base = normalizeWorkbenchDocument(document);
  const nextInstances = [...base.instances, instance];
  let nextLayout = base.layoutModel;
  if (base.instances.length === 0) {
    nextLayout = createWorkbenchLayoutModel([instance]);
  } else {
    nextLayout = insertInstanceIntoLayout(base.layoutModel, instance, openMode, anchorPaneId ?? base.activePaneId);
  }

  return normalizeWorkbenchDocument({
    ...base,
    updatedAt: nowIso(),
    activePaneId: instance.paneId,
    instances: nextInstances,
    layoutModel: nextLayout
  });
}

export function removeInstanceFromWorkbench(document: WorkbenchDocument, instanceId: string): WorkbenchDocument {
  const base = normalizeWorkbenchDocument(document);
  const target = base.instances.find((instance) => instance.instanceId === instanceId);
  if (!target) {
    return base;
  }
  const nextInstances = base.instances.filter((instance) => instance.instanceId !== instanceId);
  const nextLayout = removePaneFromLayout(base.layoutModel, target.paneId, nextInstances);
  const fallbackPaneId = base.activePaneId === target.paneId ? nextInstances[nextInstances.length - 1]?.paneId ?? null : base.activePaneId;
  return normalizeWorkbenchDocument({
    ...base,
    updatedAt: nowIso(),
    activePaneId: fallbackPaneId,
    instances: nextInstances,
    layoutModel: nextLayout
  });
}

export function replaceWorkbenchLayout(document: WorkbenchDocument, layoutModel: WorkbenchLayoutModel): WorkbenchDocument {
  return normalizeWorkbenchDocument({
    ...document,
    updatedAt: nowIso(),
    layoutModel
  });
}

export function updateWorkbenchActivePane(document: WorkbenchDocument, paneId: string | null): WorkbenchDocument {
  return normalizeWorkbenchDocument({
    ...document,
    updatedAt: nowIso(),
    activePaneId: paneId
  });
}

export function collectLayoutInstanceIds(layoutModel: WorkbenchLayoutModel): string[] {
  const instanceIds: string[] = [];
  visitLayoutTabsets(layoutModel.layout, (tabset) => {
    for (const tab of tabset.children) {
      const instanceId = typeof tab.config?.instanceId === "string" ? tab.config.instanceId : "";
      if (instanceId) {
        instanceIds.push(instanceId);
      }
    }
  });
  return instanceIds;
}

export function findActivePaneId(layoutModel: WorkbenchLayoutModel): string | null {
  let activePaneId: string | null = null;
  visitLayoutTabsets(layoutModel.layout, (tabset) => {
    if (!tabset.active) {
      return;
    }
    const selectedIndex = clampSelectedIndex(tabset.selected, tabset.children.length);
    activePaneId = tabset.children[selectedIndex]?.id ?? activePaneId;
  });
  if (activePaneId) {
    return activePaneId;
  }

  let fallback: string | null = null;
  visitLayoutTabsets(layoutModel.layout, (tabset) => {
    if (fallback) {
      return;
    }
    const selectedIndex = clampSelectedIndex(tabset.selected, tabset.children.length);
    fallback = tabset.children[selectedIndex]?.id ?? tabset.children[0]?.id ?? null;
  });
  return fallback;
}

function normalizeRowNode(
  row: FlexLayoutRowNode,
  instanceMap: Map<string, TerminalInstance>,
  seen: Set<string>,
  onFirstTabset: (tabset: FlexLayoutTabSetNode) => void
): FlexLayoutRowNode {
  const children: FlexLayoutNode[] = [];
  for (const child of row.children) {
    if (child.type === "row") {
      const normalizedRow = normalizeRowNode(child, instanceMap, seen, onFirstTabset);
      if (normalizedRow.children.length > 0) {
        children.push(normalizedRow);
      }
      continue;
    }

    const nextChildren: FlexLayoutTabNode[] = [];
    for (const tab of child.children) {
      const instanceId = String(tab.config?.instanceId ?? "");
      if (!instanceId || seen.has(instanceId)) {
        continue;
      }
      const instance = instanceMap.get(instanceId);
      if (!instance) {
        continue;
      }
      seen.add(instanceId);
      nextChildren.push(
        createWorkbenchTab({
          paneId: tab.id || instance.paneId,
          title: instance.title,
          instanceId
        })
      );
    }

    const normalizedTabset: FlexLayoutTabSetNode = {
      ...child,
      selected: clampSelectedIndex(child.selected, nextChildren.length),
      children: nextChildren
    };
    onFirstTabset(normalizedTabset);
    children.push(normalizedTabset);
  }

  return {
    ...row,
    children
  };
}

function insertInstanceIntoLayout(
  layoutModel: WorkbenchLayoutModel,
  instance: TerminalInstance,
  openMode: WorkbenchOpenMode,
  anchorPaneId?: string | null
): WorkbenchLayoutModel {
  const nextTab = createWorkbenchTab(instance);
  if (openMode === "tab" || !anchorPaneId) {
    const fallback = cloneLayout(layoutModel);
    const targetTabset = findFirstTabset(fallback.layout);
    if (!targetTabset) {
      return createWorkbenchLayoutModel([instance]);
    }
    targetTabset.children.push(nextTab);
    targetTabset.selected = targetTabset.children.length - 1;
    targetTabset.active = true;
    return WorkbenchLayoutModelSchema.parse(fallback);
  }

  const clone = cloneLayout(layoutModel);
  const inserted = insertRelativeTabset(clone.layout, nextTab, anchorPaneId, openMode, 0);
  if (!inserted) {
    const targetTabset = findFirstTabset(clone.layout);
    if (targetTabset) {
      targetTabset.children.push(nextTab);
      targetTabset.selected = targetTabset.children.length - 1;
    }
  }
  return WorkbenchLayoutModelSchema.parse(clone);
}

function removePaneFromLayout(
  layoutModel: WorkbenchLayoutModel,
  paneId: string,
  nextInstances: TerminalInstance[]
): WorkbenchLayoutModel {
  if (nextInstances.length === 0) {
    return createEmptyWorkbenchLayoutModel();
  }

  const clone = cloneLayout(layoutModel);
  const nextRoot = pruneRowNode(clone.layout, paneId);
  const layout = nextRoot ?? createWorkbenchLayoutModel(nextInstances).layout;
  return normalizeWorkbenchLayoutModel(
    WorkbenchLayoutModelSchema.parse({
      ...clone,
      layout
    }),
    nextInstances
  );
}

function pruneRowNode(row: FlexLayoutRowNode, paneId: string): FlexLayoutRowNode | null {
  const nextChildren: FlexLayoutNode[] = [];
  for (const child of row.children) {
    if (child.type === "row") {
      const normalized = pruneRowNode(child, paneId);
      if (normalized) {
        nextChildren.push(normalized);
      }
      continue;
    }

    const nextTabs = child.children.filter((tab) => tab.id !== paneId);
    if (nextTabs.length === 0) {
      continue;
    }
    nextChildren.push({
      ...child,
      selected: clampSelectedIndex(child.selected, nextTabs.length),
      children: nextTabs
    });
  }

  if (nextChildren.length === 0) {
    return null;
  }

  if (nextChildren.length === 1 && nextChildren[0]?.type === "row") {
    return nextChildren[0];
  }

  return {
    ...row,
    children: nextChildren
  };
}

function insertRelativeTabset(
  row: FlexLayoutRowNode,
  nextTab: FlexLayoutTabNode,
  anchorPaneId: string,
  openMode: Exclude<WorkbenchOpenMode, "tab">,
  depth: number
): boolean {
  for (let index = 0; index < row.children.length; index += 1) {
    const child = row.children[index];
    if (!child) {
      continue;
    }
    if (child.type === "row") {
      if (insertRelativeTabset(child, nextTab, anchorPaneId, openMode, depth + 1)) {
        return true;
      }
      continue;
    }

    if (!child.children.some((tab) => tab.id === anchorPaneId)) {
      continue;
    }

    const currentOrientation = depth % 2 === 0 ? "horizontal" : "vertical";
    const desiredOrientation = openMode === "left" || openMode === "right" ? "horizontal" : "vertical";
    const insertBefore = openMode === "left" || openMode === "up";
    const newTabset = createStandaloneTabset(nextTab);

    if (currentOrientation === desiredOrientation) {
      row.children.splice(insertBefore ? index : index + 1, 0, newTabset);
      child.weight = child.weight ?? 100;
      newTabset.weight = child.weight;
      child.active = false;
      newTabset.active = true;
      return true;
    }

    const wrappedRow: FlexLayoutRowNode = {
      type: "row",
      id: createLayoutContainerId("row"),
      weight: child.weight ?? 100,
      children: insertBefore
        ? [
            {
              ...newTabset,
              active: true
            },
            {
              ...child,
              active: false
            }
          ]
        : [
            {
              ...child,
              active: false
            },
            {
              ...newTabset,
              active: true
            }
          ]
    };
    row.children.splice(index, 1, wrappedRow);
    return true;
  }

  return false;
}

function createStandaloneTabset(tab: FlexLayoutTabNode): FlexLayoutTabSetNode {
  return {
    type: "tabset",
    id: createLayoutContainerId("tabset"),
    weight: 100,
    selected: 0,
    active: true,
    children: [tab]
  };
}

function createLayoutContainerId(prefix: "row" | "tabset"): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function findFirstTabset(row: FlexLayoutRowNode): FlexLayoutTabSetNode | null {
  for (const child of row.children) {
    if (child.type === "tabset") {
      return child;
    }
    const nested = findFirstTabset(child);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function visitLayoutTabsets(row: FlexLayoutRowNode, visitor: (tabset: FlexLayoutTabSetNode) => void): void {
  for (const child of row.children) {
    if (child.type === "tabset") {
      visitor(child);
      continue;
    }
    visitLayoutTabsets(child, visitor);
  }
}

function cloneLayout(layoutModel: WorkbenchLayoutModel): WorkbenchLayoutModel {
  return WorkbenchLayoutModelSchema.parse(structuredClone(layoutModel));
}

function clampSelectedIndex(selected: number | undefined, childCount: number): number {
  if (childCount === 0) {
    return -1;
  }
  if (typeof selected !== "number" || Number.isNaN(selected)) {
    return Math.max(0, childCount - 1);
  }
  return Math.max(0, Math.min(childCount - 1, selected));
}
