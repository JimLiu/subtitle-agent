import type {
  AudioElement,
  ImageElement,
  ProgressBarElement,
  ShapeElement,
  TextElement,
  TimelineElement,
  VideoElement,
  WaveElement,
} from "@/types/timeline";
import { createAudioRenderer } from "../renderers/audio";
import type { BaseRenderer } from "../renderers/base";
import { createImageRenderer } from "../renderers/image";
import { createProgressBarRenderer } from "../renderers/progress-bar";
import { createShapeRenderer } from "../renderers/shape";
import { createSubtitleRenderer } from "../renderers/subtitles";
import { createTextRenderer } from "../renderers/text";
import { createVideoRenderer, type VideoRenderer } from "../renderers/video";
import { createWaveRenderer, type WaveRenderer } from "../renderers/wave";
import type { PreviewPanelContext } from "./types";

/**
 * 负责根据 orderedElements 维护各类具体渲染器（文本、图片、视频、音频、波形、形状、进度条等）。
 * - 支持去抖/合并多次同步请求（队列化）；
 * - 在舞台/音频上下文准备就绪后再创建渲染器；
 * - 当 element 消失或不可渲染时销毁对应渲染器。
 */
export class RendererManager {
  private readonly context: PreviewPanelContext;
  private readonly renderers: Map<string, BaseRenderer<TimelineElement>> = new Map();
  private elementSyncInFlight = false;
  private queuedElementSync: TimelineElement[] | null = null;

  constructor(context: PreviewPanelContext) {
    this.context = context;
  }

  destroy(): void {
    this.renderers.forEach((renderer) => renderer.destroy());
    this.renderers.clear();
    this.elementSyncInFlight = false;
    this.queuedElementSync = null;
  }

  forEach(callback: (renderer: BaseRenderer<TimelineElement>) => void): void {
    this.renderers.forEach(callback);
  }

  handlePreviewError(elementId: string): void {
    console.error(`Error rendering element ${elementId}. Attempting recovery.`);
    try {
      const element = this.context.store.getState().getElementById(elementId);
      const { stage, transformer, layer } = this.context.getState();
      if (!element || !stage) {
        return;
      }
      const node = stage.findOne(`#${elementId}`);
      node?.destroy();
      layer?.batchDraw();
      if (this.context.getState().selectedShapeName === elementId && transformer) {
        transformer.detach();
        transformer.forceUpdate();
      }
    } catch (error) {
      console.error("Failed to recover from rendering error:", error);
    }
  }

  /** 请求同步渲染器集合：新请求会覆盖队列的目标，串行逐一执行，避免重复构建/销毁。 */
  async syncElementRenderers(ordered: TimelineElement[]): Promise<void> {
    this.queuedElementSync = ordered;
    if (this.elementSyncInFlight) {
      return;
    }

    this.elementSyncInFlight = true;
    try {
      while (this.queuedElementSync) {
        const nextOrdered = this.queuedElementSync;
        this.queuedElementSync = null;
        if (!nextOrdered) {
          continue;
        }
        await this.performElementSync(nextOrdered);
      }
    } finally {
      this.elementSyncInFlight = false;
    }
  }

  /**
   * 执行一次实际的同步：
   * - 为每个需要渲染的 element 创建或更新对应 renderer；
   * - 不需要的 renderer 将被销毁；
   * - 同步 zIndex、可见性与播放状态。
   */
  private async performElementSync(ordered: TimelineElement[]): Promise<void> {
    const state = this.context.getState();
    const { stage, videoGroup, konvaInit, audioContext, analyzer, currentTimestamp, playing, layer } = state;
    if (!stage || !videoGroup || !konvaInit) {
      return;
    }

    const frameContext = this.context.getRendererFrameContext();
    const seen = new Set<string>();
    for (let index = 0; index < ordered.length; index += 1) {
      const element = ordered[index];
      const id = element.id;
      seen.add(id);

      if (!this.shouldRenderElement(element, Boolean(audioContext), Boolean(analyzer))) {
        const existing = this.renderers.get(id);
        if (existing) {
          existing.destroy();
          this.renderers.delete(id);
        }
        continue;
      }

      let renderer = this.renderers.get(id);
      if (!renderer) {
        renderer = await this.createRenderer(element);
        if (!renderer) {
          continue;
        }
        this.renderers.set(id, renderer);
        renderer.frameUpdate(frameContext);
      } else {
        renderer.update(element);
        renderer.frameUpdate(frameContext);
      }

      if (element.type === "video" && audioContext && analyzer) {
        (renderer as VideoRenderer).ensureAudioContext?.(audioContext, analyzer);
      }
      if (element.type === "wave" && audioContext && analyzer) {
        (renderer as WaveRenderer).ensureAudioContext?.(audioContext, analyzer);
      }

      renderer.setZIndex(element.zIndex ?? index);
      renderer.syncVisibility(currentTimestamp);
      renderer.handlePlayingChange(playing);
    }

    for (const [id, renderer] of this.renderers.entries()) {
      if (!seen.has(id)) {
        renderer.destroy();
        this.renderers.delete(id);
      }
    }

    layer?.batchDraw();
  }

  /** 根据 element 的类型创建具体渲染器。视频/音频需要音频上下文才创建。 */
  private async createRenderer(element: TimelineElement): Promise<BaseRenderer<TimelineElement> | null> {
    const state = this.context.getState();
    const { stage, videoGroup, audioContext, analyzer } = state;
    if (!stage || !videoGroup) {
      return null;
    }

    const updateElement = (payload: Partial<TimelineElement> & { id: string }) => this.context.actions.updateElement(payload);

    switch (element.type) {
      case "text": {
        const renderer = createTextRenderer({
          element: element as TextElement,
          stage,
          container: videoGroup,
          updateElement,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error("Failed to initialise text renderer", error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case "subtitles": {
        const renderer = createSubtitleRenderer({
          element: element as TextElement,
          stage,
          container: videoGroup,
          updateElement,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error("Failed to initialise subtitle renderer", error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case "image": {
        const renderer = createImageRenderer({
          element: element as ImageElement,
          stage,
          container: videoGroup,
          updateElement,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error("Failed to initialise image renderer", error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case "shape": {
        const renderer = createShapeRenderer({
          element: element as ShapeElement,
          stage,
          container: videoGroup,
          updateElement,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error("Failed to initialise shape renderer", error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case "progress_bar": {
        const renderer = createProgressBarRenderer({
          element: element as ProgressBarElement,
          stage,
          container: videoGroup,
          updateElement,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error("Failed to initialise progress bar renderer", error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case "wave": {
        const renderer = createWaveRenderer({
          element: element as WaveElement,
          stage,
          container: videoGroup,
          updateElement,
          audioContext: audioContext ?? undefined,
          analyzer: analyzer ?? undefined,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error("Failed to initialise wave renderer", error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case "video": {
        const renderer = createVideoRenderer({
          element: element as VideoElement,
          stage,
          container: videoGroup,
          updateElement,
          audioContext,
          analyzer,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error("Failed to initialise video renderer", error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case "audio": {
        if (!audioContext || !analyzer) {
          return null;
        }
        const renderer = createAudioRenderer({
          element: element as AudioElement,
          stage,
          container: videoGroup,
          updateElement,
          audioContext,
          analyzer,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error("Failed to initialise audio renderer", error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      default:
        return null;
    }
  }

  /** 判断某段落是否可渲染（视频/音频需要音频上下文和解析到的 remoteSource）。 */
  private shouldRenderElement(element: TimelineElement, hasAudioContext: boolean, hasAnalyzer: boolean): boolean {
    switch (element.type) {
      case "text":
      case "subtitles":
      case "image":
      case "shape":
      case "progress_bar":
      case "wave":
        return true;
      case "video":
      case "audio":
        return Boolean(hasAudioContext && hasAnalyzer && element.remoteSource);
      default:
        return false;
    }
  }
}
