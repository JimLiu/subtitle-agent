import type { TimelineElement } from "@/types/timeline";
import type { PreviewPanelStore, PreviewPanelStoreData, PreviewPanelStoreState } from "../preview-panel-store";
import type { RendererFrameContext } from "../renderers/base";

/**
 * 可选的外部动作回调集合。
 * 由容器或视图层传入，以便在 Konva 实例内部触发业务层行为（播放、选中、增删改元素等）。
 */
export interface PreviewPanelKonvaActions {
  setPlaying?(value: boolean): void;
  setSelectedElement?(id: string | null): void;
  removeActiveTool?(): void;
  setActiveTool?(tool: string): void;
  updateElement?(payload: Partial<TimelineElement> & { id: string }): void | Promise<void>;
  setPreviewThumbnail?(path: string): Promise<void> | void;
  deleteElement?(id: string): void | Promise<void>;
  duplicateElement?(payload: { id: string }): void | Promise<void>;
}

/**
 * Konva 预览面板构造参数。
 */
export interface PreviewPanelKonvaConfig {
  container: HTMLElement;
  store: PreviewPanelStore;
  actions?: PreviewPanelKonvaActions;
}

/**
 * Konva 内部使用的动作处理器，均为必需字段（构造时用 no-op 填充，随后通过 updateActions 注入真正实现）。
 */
export interface PreviewPanelActionHandlers {
  setPlaying(value: boolean): void;
  setSelectedElement(id: string | null): void;
  removeActiveTool(): void;
  setActiveTool(tool: string): void;
  updateElement(payload: Partial<TimelineElement> & { id: string }): void | Promise<void>;
  setPreviewThumbnail(path: string): Promise<void> | void;
  deleteElement(id: string): void | Promise<void>;
  duplicateElement(payload: { id: string }): void | Promise<void>;
}

/**
 * Konva 运行时上下文：聚合容器、store、便捷的 get/patch 方法、帧上下文获取与动作处理器。
 */
export interface PreviewPanelContext {
  container: HTMLElement;
  store: PreviewPanelStore;
  getState(): PreviewPanelStoreState;
  patch(partial: Partial<PreviewPanelStoreData>): void;
  getRendererFrameContext(): RendererFrameContext;
  actions: PreviewPanelActionHandlers;
}
