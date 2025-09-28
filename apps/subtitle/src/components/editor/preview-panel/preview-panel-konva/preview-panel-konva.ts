import hotkeys from "hotkeys-js";
import cloneDeep from "lodash/cloneDeep";

import type { TimelineElement } from "@/types/timeline";
import type { ExportOptions, ExportResult } from "@/types/export";
import { exportPreviewVideo } from "../export/export-video";
import type {
  PreviewPanelStore,
  PreviewPanelStoreData,
  PreviewPanelStoreState,
} from "../preview-panel-store";
import type { RendererFrameContext } from "../renderers/base";
import { AudioManager } from "./audio-manager";
import { RendererManager } from "./renderer-manager";
import { StageManager } from "./stage-manager";
import {
  computeMaxZIndex,
  computeMinZIndex,
  computeOrderedElements,
} from "./element-utils";
import type {
  PreviewPanelActionHandlers,
  PreviewPanelContext,
  PreviewPanelKonvaActions,
  PreviewPanelKonvaConfig,
} from "./types";

/**
 * 预览面板的核心渲染类（Konva 版）：
 * - 负责初始化舞台、图层、渲染器管理与音频初始化；
 * - 订阅 PreviewPanelStore 的变化并驱动渲染器；
 * - 对外暴露一组编辑/导出相关的操作（删除、复制、置顶/置底、导出视频等）。
 */
export class PreviewPanelKonva {
  private readonly container: HTMLElement;
  private readonly store: PreviewPanelStore;
  private readonly unsubscribeFns: Array<() => void> = [];

  private readonly actions: PreviewPanelActionHandlers;
  private readonly context: PreviewPanelContext;
  private readonly rendererManager: RendererManager;
  private readonly stageManager: StageManager;
  private readonly audioManager: AudioManager;

  /**
   * 构造函数：注入容器与 store，创建渲染上下文，并初始化各个管理器。
   */
  constructor(options: PreviewPanelKonvaConfig) {
    this.container = options.container;
    this.store = options.store;
    this.actions = this.createActionHandlers();
    this.updateActions(options.actions ?? {});

    this.context = {
      container: this.container,
      store: this.store,
      getState: () => this.getState(),
      patch: (partial) => this.patch(partial),
      getRendererFrameContext: () => this.getRendererFrameContext(),
      actions: this.actions,
    };

    this.rendererManager = new RendererManager(this.context);
    this.stageManager = new StageManager(this.context, this.rendererManager);
    this.audioManager = new AudioManager(this.context);
  }

  /**
   * 更新外部动作回调（在视图层变更回调时调用）。
   */
  updateActions(actions: PreviewPanelKonvaActions = {}): void {
    if (actions.setPlaying) {
      this.actions.setPlaying = actions.setPlaying;
    }
    if (actions.setSelectedElement) {
      this.actions.setSelectedElement = actions.setSelectedElement;
    }
    if (actions.removeActiveTool) {
      this.actions.removeActiveTool = actions.removeActiveTool;
    }
    if (actions.setActiveTool) {
      this.actions.setActiveTool = actions.setActiveTool;
    }
    if (actions.updateElement) {
      this.actions.updateElement = actions.updateElement;
    }
    if (actions.setPreviewThumbnail) {
      this.actions.setPreviewThumbnail = actions.setPreviewThumbnail;
    }
    if (actions.deleteElement) {
      this.actions.deleteElement = actions.deleteElement;
    }
    if (actions.duplicateElement) {
      this.actions.duplicateElement = actions.duplicateElement;
    }
  }

  /** 容器节点（DOM）。 */
  getContainer(): HTMLElement {
    return this.container;
  }

  /** 预览面板的 Zustand store 实例。 */
  getStore(): PreviewPanelStore {
    return this.store;
  }

  /** 初始化：构建音频、舞台、订阅 store，完成初始渲染。 */
  initialize(): void {
    this.audioManager.initialize();
    this.stageManager.initialize();
    this.stageManager.initializeObservers();
    this.bindShortcuts();
    this.setupStoreSubscriptions();
    this.primeElements();
  }

  /** 销毁：解绑热键、取消订阅、释放资源。 */
  destroy(): void {
    hotkeys.unbind("cmd+s, ctrl+s");

    this.unsubscribeFns.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeFns.length = 0;

    this.audioManager.destroy();
    this.stageManager.destroy();
    this.rendererManager.destroy();
  }

  /** 便捷 patch：转发到 store 的 patch。 */
  patch(partial: Partial<PreviewPanelStoreData>): void {
    this.store.getState().patch(partial);
  }

  /** 删除当前选中元素，并清理选中/工具状态。 */
  remove(): void {
    const { selectedElement } = this.getState();
    if (!selectedElement) {
      return;
    }
    const removedId = selectedElement;
    this.patch({ selectedShapeName: null, hoverShapeName: null });
    this.actions.removeActiveTool();
    this.actions.setSelectedElement(null);
    this.actions.deleteElement(removedId);
    this.stageManager.updateTransformer();
  }

  /** 将当前选中元素置于最上层（zIndex = maxZ + 1）。 */
  bringToFront(): void {
    const { selectedElement, maxZIndex } = this.getState();
    if (!selectedElement) {
      return;
    }
    this.actions.updateElement({ id: selectedElement, zIndex: maxZIndex + 1 });
  }

  /** 将当前选中元素置于最下层（zIndex = minZ - 1）。 */
  sendToBack(): void {
    const { selectedElement, minZIndex } = this.getState();
    if (!selectedElement) {
      return;
    }
    this.actions.updateElement({ id: selectedElement, zIndex: minZIndex - 1 });
  }

  /** 复制当前选中元素。 */
  duplicate(): void {
    const { selectedElement } = this.getState();
    if (!selectedElement) {
      return;
    }
    this.actions.duplicateElement({ id: selectedElement });
  }

  /**
   * 导出视频：
   * - 尝试暂停播放以确保画面稳定；
   * - 获取排序后的段落列表与导出尺寸；
   * - 调用 exportPreviewVideo 完成导出。
   */
  async exportVideo(options: ExportOptions): Promise<ExportResult> {
    try {
      this.actions.setPlaying(false);
    } catch (error) {
      console.warn("Failed to pause preview before export", error);
    }

    const state = this.getState();
    const ordered = state.orderedElements.length
      ? state.orderedElements.map((element) => cloneDeep(element))
      : computeOrderedElements(state.elements);

    if (!ordered.length) {
      return { success: false, error: "没有可导出的内容" };
    }

    const width = state.idealWidth || state.size.original.width || state.stageWidth || 1920;
    const height = state.idealHeight || state.size.original.height || state.stageHeight || 1080;
    const backgroundColor = state.backgroundColor ?? "#000000";

    return exportPreviewVideo({
      elements: ordered,
      settings: {
        width,
        height,
        backgroundColor,
      },
      options,
    });
  }

  /** 外部通知 Konva：某个段落渲染失败，尝试自愈处理。 */
  handlePreviewError(elementId: string): void {
    this.rendererManager.handlePreviewError(elementId);
  }

  /** 绑定通用快捷键（如 cmd/ctrl + s 触发缩略图更新）。 */
  private bindShortcuts(): void {
    hotkeys("cmd+s, ctrl+s", (event) => {
      void this.stageManager.updateThumbnail();
      event.preventDefault();
    });
  }

  /** 获取最新的 store 状态。 */
  private getState(): PreviewPanelStoreState {
    return this.store.getState();
  }

  /**
   * 订阅 store 的关键字段变化：
   * - selectedElement：更新选中态与变换器；
   * - backgroundColor：更新背景色；
   * - elements：重算排序与 zIndex 范围；
   * - orderedElements：同步渲染器集合；
   * - currentTimestamp/playing：通知每个渲染器进行时间/播放状态同步；
   * - audioContext：音频初始化完成后再次同步渲染器（使视频/波形具备音频上下文）。
   */
  private setupStoreSubscriptions(): void {
    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.selectedElement,
        (selected, previous) => {
          if (selected === previous) {
            return;
          }
          this.patch({ selectedShapeName: selected });
          this.stageManager.updateTransformer();
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.backgroundColor,
        (color, previous) => {
          if (color === previous) {
            return;
          }
          const { backgroundRect, layer } = this.getState();
          if (backgroundRect) {
            backgroundRect.fill(color);
            layer?.batchDraw();
          }
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.elements,
        (elements) => {
          const ordered = computeOrderedElements(elements);
          const minZ = computeMinZIndex(elements);
          const maxZ = computeMaxZIndex(elements);
          this.patch({ orderedElements: ordered, minZIndex: minZ, maxZIndex: maxZ });
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.orderedElements,
        (ordered) => {
          void this.rendererManager.syncElementRenderers(ordered);
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.currentTimestamp,
        (timestamp) => {
          this.rendererManager.forEach((renderer) => {
            renderer.syncVisibility(timestamp);
          });
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.playing,
        (playing) => {
          this.rendererManager.forEach((renderer) => {
            renderer.handlePlayingChange(playing);
          });
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.audioContext,
        (audioContext, previous) => {
          if (!previous && audioContext) {
            void this.rendererManager.syncElementRenderers(this.getState().orderedElements);
          }
        },
      ),
    );
  }

  /** 根据当前状态组装渲染帧上下文（时间戳、舞台尺寸、缩放等）。 */
  private getRendererFrameContext(): RendererFrameContext {
    const state = this.getState();
    const idealWidth = state.idealWidth || state.size.original.width || state.stageWidth || 0;
    const idealHeight = state.idealHeight || state.size.original.height || state.stageHeight || 0;
    return {
      timestamp: state.currentTimestamp,
      playing: state.playing,
      stageSize: { width: idealWidth, height: idealHeight },
      scale: state.scaleFactor || 1,
    };
  }

  /** 创建一组 no-op 的动作处理器，稍后通过 updateActions 注入真正实现。 */
  private createActionHandlers(): PreviewPanelActionHandlers {
    return {
      setPlaying: () => undefined,
      setSelectedElement: () => undefined,
      removeActiveTool: () => undefined,
      setActiveTool: () => undefined,
      updateElement: () => undefined,
      setPreviewThumbnail: () => undefined,
      deleteElement: () => undefined,
      duplicateElement: () => undefined,
    };
  }

  /** 初次渲染：根据已有 elements 计算排序、zIndex 范围，并同步渲染器集合。 */
  private primeElements(): void {
    const initialElements = this.getState().elements;
    if (Object.keys(initialElements).length) {
      const ordered = computeOrderedElements(initialElements);
      this.patch({
        orderedElements: ordered,
        minZIndex: computeMinZIndex(initialElements),
        maxZIndex: computeMaxZIndex(initialElements),
      });
    }
    void this.rendererManager.syncElementRenderers(this.getState().orderedElements);
  }
}
