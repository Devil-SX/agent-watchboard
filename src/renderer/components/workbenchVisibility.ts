import type { TabNode, TabSetNode } from "flexlayout-react";

export function isTabNodeVisible(node: TabNode): boolean {
  const parent = node.getParent();
  if (!parent || parent.getType() !== "tabset") {
    return true;
  }
  return (parent as TabSetNode).getSelectedNode()?.getId() === node.getId();
}
