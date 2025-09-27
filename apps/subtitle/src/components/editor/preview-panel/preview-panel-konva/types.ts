import type { TimelineElement } from "@/types/timeline";
import type { PreviewPanelStore, PreviewPanelStoreData, PreviewPanelStoreState } from "../preview-panel-store";
import type { RendererFrameContext } from "../renderers/base";

export interface PreviewPanelKonvaActions {
  setPlaying?(value: boolean): void;
  setSelectedSegment?(id: string | null): void;
  removeActiveTool?(): void;
  setActiveTool?(tool: string): void;
  updateSegment?(payload: Partial<TimelineElement> & { id: string }): void | Promise<void>;
  setPreviewThumbnail?(path: string): Promise<void> | void;
  deleteSegment?(id: string): void | Promise<void>;
  duplicateSegment?(payload: { id: string }): void | Promise<void>;
}

export interface PreviewPanelKonvaConfig {
  container: HTMLElement;
  store: PreviewPanelStore;
  actions?: PreviewPanelKonvaActions;
}

export interface PreviewPanelActionHandlers {
  setPlaying(value: boolean): void;
  setSelectedSegment(id: string | null): void;
  removeActiveTool(): void;
  setActiveTool(tool: string): void;
  updateSegment(payload: Partial<TimelineElement> & { id: string }): void | Promise<void>;
  setPreviewThumbnail(path: string): Promise<void> | void;
  deleteSegment(id: string): void | Promise<void>;
  duplicateSegment(payload: { id: string }): void | Promise<void>;
}

export interface PreviewPanelContext {
  container: HTMLElement;
  store: PreviewPanelStore;
  getState(): PreviewPanelStoreState;
  patch(partial: Partial<PreviewPanelStoreData>): void;
  getRendererFrameContext(): RendererFrameContext;
  actions: PreviewPanelActionHandlers;
}
