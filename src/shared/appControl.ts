import { z } from "zod";

import type { WorkbenchLayoutModel, WorkbenchOpenMode } from "@shared/schema";

export const RuntimePanelKindSchema = z.enum(["image", "browser"]);
export type RuntimePanelKind = z.infer<typeof RuntimePanelKindSchema>;

export const RuntimePanelPlacementSchema = z.object({
  mode: z.enum(["tab", "right", "down"]).default("right"),
  anchorPaneId: z.string().optional()
});
export type RuntimePanelPlacement = z.infer<typeof RuntimePanelPlacementSchema>;

export const RuntimeImagePanelSchema = z.object({
  panelId: z.string(),
  paneId: z.string(),
  kind: z.literal("image"),
  title: z.string(),
  hostFilePath: z.string(),
  createdAt: z.string()
});

export const RuntimeBrowserPanelSchema = z.object({
  panelId: z.string(),
  paneId: z.string(),
  kind: z.literal("browser"),
  title: z.string(),
  url: z.string(),
  createdAt: z.string()
});

export const RuntimePanelSchema = z.discriminatedUnion("kind", [RuntimeImagePanelSchema, RuntimeBrowserPanelSchema]);
export type RuntimePanel = z.infer<typeof RuntimePanelSchema>;

export const CreateImagePanelInputSchema = z.object({
  title: z.string().optional(),
  hostFilePath: z.string(),
  placement: RuntimePanelPlacementSchema.default({
    mode: "right"
  })
});
export type CreateImagePanelInput = z.infer<typeof CreateImagePanelInputSchema>;

export const CreateBrowserPanelInputSchema = z.object({
  title: z.string().optional(),
  url: z.string(),
  placement: RuntimePanelPlacementSchema.default({
    mode: "right"
  })
});
export type CreateBrowserPanelInput = z.infer<typeof CreateBrowserPanelInputSchema>;

export const CloseRuntimePanelInputSchema = z.object({
  panelId: z.string()
});
export type CloseRuntimePanelInput = z.infer<typeof CloseRuntimePanelInputSchema>;

export type LayoutSnapshotPane =
  | {
      kind: "terminal";
      paneId: string;
      title: string;
      active: boolean;
      instanceId: string | null;
    }
  | {
      kind: "image" | "browser";
      paneId: string;
      title: string;
      active: boolean;
      panelId: string;
      source: string;
    };

export type LayoutSnapshot = {
  activePaneId: string | null;
  panes: LayoutSnapshotPane[];
  layoutModel: WorkbenchLayoutModel;
};

export type AppControlActionDescriptor = {
  id: string;
  title: string;
  description: string;
  surfaces: Array<"protocol" | "cli">;
  risk: "safe" | "external";
};

export type AppControlRequest =
  | { id: string; method: "layout.getSnapshot"; params?: Record<string, never> }
  | { id: string; method: "panel.createImage"; params: CreateImagePanelInput }
  | { id: string; method: "panel.createBrowser"; params: CreateBrowserPanelInput }
  | { id: string; method: "panel.close"; params: CloseRuntimePanelInput }
  | { id: string; method: "action.list"; params?: Record<string, never> }
  | { id: string; method: "action.describe"; params: { actionId: string } };

export type AppControlResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { code: string; message: string } };

export function runtimePlacementToOpenMode(placement?: RuntimePanelPlacement): WorkbenchOpenMode {
  if (!placement) {
    return "right";
  }
  return placement.mode === "down" ? "down" : placement.mode === "tab" ? "tab" : "right";
}
