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

export class RendererManager {
  private readonly context: PreviewPanelContext;
  private readonly renderers: Map<string, BaseRenderer<TimelineElement>> = new Map();
  private segmentSyncInFlight = false;
  private queuedSegmentSync: TimelineElement[] | null = null;

  constructor(context: PreviewPanelContext) {
    this.context = context;
  }

  destroy(): void {
    this.renderers.forEach((renderer) => renderer.destroy());
    this.renderers.clear();
    this.segmentSyncInFlight = false;
    this.queuedSegmentSync = null;
  }

  forEach(callback: (renderer: BaseRenderer<TimelineElement>) => void): void {
    this.renderers.forEach(callback);
  }

  handlePreviewError(segmentId: string): void {
    console.error(`Error rendering segment ${segmentId}. Attempting recovery.`);
    try {
      const segment = this.context.store.getState().getSegmentById(segmentId);
      const { stage, transformer, layer } = this.context.getState();
      if (!segment || !stage) {
        return;
      }
      const node = stage.findOne(`#${segmentId}`);
      node?.destroy();
      layer?.batchDraw();
      if (this.context.getState().selectedShapeName === segmentId && transformer) {
        transformer.detach();
        transformer.forceUpdate();
      }
    } catch (error) {
      console.error("Failed to recover from rendering error:", error);
    }
  }

  async syncSegmentRenderers(ordered: TimelineElement[]): Promise<void> {
    this.queuedSegmentSync = ordered;
    if (this.segmentSyncInFlight) {
      return;
    }

    this.segmentSyncInFlight = true;
    try {
      while (this.queuedSegmentSync) {
        const nextOrdered = this.queuedSegmentSync;
        this.queuedSegmentSync = null;
        if (!nextOrdered) {
          continue;
        }
        await this.performSegmentSync(nextOrdered);
      }
    } finally {
      this.segmentSyncInFlight = false;
    }
  }

  private async performSegmentSync(ordered: TimelineElement[]): Promise<void> {
    const state = this.context.getState();
    const { stage, videoGroup, konvaInit, audioContext, analyzer, currentTimestamp, playing, layer } = state;
    if (!stage || !videoGroup || !konvaInit) {
      return;
    }

    const frameContext = this.context.getRendererFrameContext();
    const seen = new Set<string>();
    for (let index = 0; index < ordered.length; index += 1) {
      const segment = ordered[index];
      const id = segment.id;
      seen.add(id);

      if (!this.shouldRenderSegment(segment, Boolean(audioContext), Boolean(analyzer))) {
        const existing = this.renderers.get(id);
        if (existing) {
          existing.destroy();
          this.renderers.delete(id);
        }
        continue;
      }

      let renderer = this.renderers.get(id);
      if (!renderer) {
        renderer = await this.createRenderer(segment);
        if (!renderer) {
          continue;
        }
        this.renderers.set(id, renderer);
        renderer.frameUpdate(frameContext);
      } else {
        renderer.update(segment);
        renderer.frameUpdate(frameContext);
      }

      if (segment.type === "video" && audioContext && analyzer) {
        (renderer as VideoRenderer).ensureAudioContext?.(audioContext, analyzer);
      }
      if (segment.type === "wave" && audioContext && analyzer) {
        (renderer as WaveRenderer).ensureAudioContext?.(audioContext, analyzer);
      }

      renderer.setZIndex(segment.zIndex ?? index);
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

  private async createRenderer(segment: TimelineElement): Promise<BaseRenderer<TimelineElement> | null> {
    const state = this.context.getState();
    const { stage, videoGroup, audioContext, analyzer } = state;
    if (!stage || !videoGroup) {
      return null;
    }

    const updateSegment = (payload: Partial<TimelineElement> & { id: string }) => this.context.actions.updateSegment(payload);

    switch (segment.type) {
      case "text": {
        const renderer = createTextRenderer({
          segment: segment as TextElement,
          stage,
          container: videoGroup,
          updateSegment,
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
          segment: segment as TextElement,
          stage,
          container: videoGroup,
          updateSegment,
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
          segment: segment as ImageElement,
          stage,
          container: videoGroup,
          updateSegment,
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
          segment: segment as ShapeElement,
          stage,
          container: videoGroup,
          updateSegment,
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
          segment: segment as ProgressBarElement,
          stage,
          container: videoGroup,
          updateSegment,
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
          segment: segment as WaveElement,
          stage,
          container: videoGroup,
          updateSegment,
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
          segment: segment as VideoElement,
          stage,
          container: videoGroup,
          updateSegment,
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
          segment: segment as AudioElement,
          stage,
          container: videoGroup,
          updateSegment,
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

  private shouldRenderSegment(segment: TimelineElement, hasAudioContext: boolean, hasAnalyzer: boolean): boolean {
    switch (segment.type) {
      case "text":
      case "subtitles":
      case "image":
      case "shape":
      case "progress_bar":
      case "wave":
        return true;
      case "video":
      case "audio":
        return Boolean(hasAudioContext && hasAnalyzer && segment.remoteSource);
      default:
        return false;
    }
  }
}
