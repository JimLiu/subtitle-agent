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
  computeOrderedSegments,
} from "./segment-utils";
import type {
  PreviewPanelActionHandlers,
  PreviewPanelContext,
  PreviewPanelKonvaActions,
  PreviewPanelKonvaConfig,
} from "./types";

export class PreviewPanelKonva {
  private readonly container: HTMLElement;
  private readonly store: PreviewPanelStore;
  private readonly unsubscribeFns: Array<() => void> = [];

  private readonly actions: PreviewPanelActionHandlers;
  private readonly context: PreviewPanelContext;
  private readonly rendererManager: RendererManager;
  private readonly stageManager: StageManager;
  private readonly audioManager: AudioManager;

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

  updateActions(actions: PreviewPanelKonvaActions = {}): void {
    if (actions.setPlaying) {
      this.actions.setPlaying = actions.setPlaying;
    }
    if (actions.setSelectedSegment) {
      this.actions.setSelectedSegment = actions.setSelectedSegment;
    }
    if (actions.removeActiveTool) {
      this.actions.removeActiveTool = actions.removeActiveTool;
    }
    if (actions.setActiveTool) {
      this.actions.setActiveTool = actions.setActiveTool;
    }
    if (actions.updateSegment) {
      this.actions.updateSegment = actions.updateSegment;
    }
    if (actions.setPreviewThumbnail) {
      this.actions.setPreviewThumbnail = actions.setPreviewThumbnail;
    }
    if (actions.deleteSegment) {
      this.actions.deleteSegment = actions.deleteSegment;
    }
    if (actions.duplicateSegment) {
      this.actions.duplicateSegment = actions.duplicateSegment;
    }
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  getStore(): PreviewPanelStore {
    return this.store;
  }

  initialize(): void {
    this.audioManager.initialize();
    this.stageManager.initialize();
    this.stageManager.initializeObservers();
    this.bindShortcuts();
    this.setupStoreSubscriptions();
    this.primeSegments();
  }

  destroy(): void {
    hotkeys.unbind("cmd+s, ctrl+s");

    this.unsubscribeFns.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeFns.length = 0;

    this.audioManager.destroy();
    this.stageManager.destroy();
    this.rendererManager.destroy();
  }

  patch(partial: Partial<PreviewPanelStoreData>): void {
    this.store.getState().patch(partial);
  }

  remove(): void {
    const { selectedSegment } = this.getState();
    if (!selectedSegment) {
      return;
    }
    const removedId = selectedSegment;
    this.patch({ selectedShapeName: null, hoverShapeName: null });
    this.actions.removeActiveTool();
    this.actions.setSelectedSegment(null);
    this.actions.deleteSegment(removedId);
    this.stageManager.updateTransformer();
  }

  bringToFront(): void {
    const { selectedSegment, maxZIndex } = this.getState();
    if (!selectedSegment) {
      return;
    }
    this.actions.updateSegment({ id: selectedSegment, zIndex: maxZIndex + 1 });
  }

  sendToBack(): void {
    const { selectedSegment, minZIndex } = this.getState();
    if (!selectedSegment) {
      return;
    }
    this.actions.updateSegment({ id: selectedSegment, zIndex: minZIndex - 1 });
  }

  duplicate(): void {
    const { selectedSegment } = this.getState();
    if (!selectedSegment) {
      return;
    }
    this.actions.duplicateSegment({ id: selectedSegment });
  }

  async exportVideo(options: ExportOptions): Promise<ExportResult> {
    try {
      this.actions.setPlaying(false);
    } catch (error) {
      console.warn("Failed to pause preview before export", error);
    }

    const state = this.getState();
    const ordered = state.orderedSegments.length
      ? state.orderedSegments.map((segment) => cloneDeep(segment))
      : computeOrderedSegments(state.segments);

    if (!ordered.length) {
      return { success: false, error: "没有可导出的内容" };
    }

    const width = state.idealWidth || state.size.original.width || state.stageWidth || 1920;
    const height = state.idealHeight || state.size.original.height || state.stageHeight || 1080;
    const backgroundColor = state.backgroundColor ?? "#000000";

    return exportPreviewVideo({
      segments: ordered,
      settings: {
        width,
        height,
        backgroundColor,
      },
      options,
    });
  }

  handlePreviewError(segmentId: string): void {
    this.rendererManager.handlePreviewError(segmentId);
  }

  private bindShortcuts(): void {
    hotkeys("cmd+s, ctrl+s", (event) => {
      void this.stageManager.updateThumbnail();
      event.preventDefault();
    });
  }

  private getState(): PreviewPanelStoreState {
    return this.store.getState();
  }

  private setupStoreSubscriptions(): void {
    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.selectedSegment,
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
        (state) => state.segments,
        (segments) => {
          const ordered = computeOrderedSegments(segments);
          const minZ = computeMinZIndex(segments);
          const maxZ = computeMaxZIndex(segments);
          this.patch({ orderedSegments: ordered, minZIndex: minZ, maxZIndex: maxZ });
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.orderedSegments,
        (ordered) => {
          void this.rendererManager.syncSegmentRenderers(ordered);
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
            void this.rendererManager.syncSegmentRenderers(this.getState().orderedSegments);
          }
        },
      ),
    );
  }

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

  private createActionHandlers(): PreviewPanelActionHandlers {
    return {
      setPlaying: () => undefined,
      setSelectedSegment: () => undefined,
      removeActiveTool: () => undefined,
      setActiveTool: () => undefined,
      updateSegment: () => undefined,
      setPreviewThumbnail: () => undefined,
      deleteSegment: () => undefined,
      duplicateSegment: () => undefined,
    };
  }

  private primeSegments(): void {
    const initialSegments = this.getState().segments;
    if (Object.keys(initialSegments).length) {
      const ordered = computeOrderedSegments(initialSegments);
      this.patch({
        orderedSegments: ordered,
        minZIndex: computeMinZIndex(initialSegments),
        maxZIndex: computeMaxZIndex(initialSegments),
      });
    }
    void this.rendererManager.syncSegmentRenderers(this.getState().orderedSegments);
  }
}
