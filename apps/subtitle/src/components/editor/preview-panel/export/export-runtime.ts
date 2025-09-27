import Konva from 'konva';

import { videoCache } from '@/lib/video-cache';
import {
  AudioElement,
  ImageElement,
  ProgressBarElement,
  ShapeElement,
  TextElement,
  TimelineElement,
  VideoElement,
  WaveElement,
} from "@/types/timeline";
import { BaseRenderer, RendererFrameContext } from '../renderers/base';
import { createTextRenderer } from '../renderers/text';
import { createSubtitleRenderer } from '../renderers/subtitles';
import { createImageRenderer } from '../renderers/image';
import { createShapeRenderer } from '../renderers/shape';
import { createProgressBarRenderer } from '../renderers/progress-bar';
import { createWaveRenderer } from '../renderers/wave';
import { createVideoRenderer, VideoRenderer } from '../renderers/video';
import { createAudioRenderer } from '../renderers/audio';
import { SpectrumAnalyzer } from '../deps/spectrum-analyzer';
import { SAMPLE_RATE } from '../deps/constants';
import { getSegmentEndTime } from '../deps/segment-helpers';

// 预览导出运行时：隐藏在 DOM 中的最小舞台环境，用于逐帧渲染
interface ManagedRenderer {
  renderer: BaseRenderer<TimelineElement>;
  segment: TimelineElement;
}

export interface PreviewExportRuntimeConfig {
  width: number;
  height: number;
  backgroundColor: string;
  segments: TimelineElement[];
}

export class PreviewExportRuntime {
  private readonly width: number;
  private readonly height: number;
  private readonly backgroundColor: string;
  private readonly segments: TimelineElement[];

  private container: HTMLDivElement | null = null;
  private stage: Konva.Stage | null = null;
  private layer: Konva.Layer | null = null;
  private contentGroup: Konva.Group | null = null;
  private managedRenderers: ManagedRenderer[] = [];
  private videoSources = new Map<string, File | Blob | string>();
  private audioContext: AudioContext | null = null;
  private analyzer: SpectrumAnalyzer | null = null;

  constructor(config: PreviewExportRuntimeConfig) {
    this.width = config.width;
    this.height = config.height;
    this.backgroundColor = config.backgroundColor;
    this.segments = config.segments;
  }

  async initialize(): Promise<void> {
    if (this.stage) {
      return;
    }

    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.pointerEvents = 'none';
    this.container.style.opacity = '0';
    this.container.style.width = `${this.width}px`;
    this.container.style.height = `${this.height}px`;
    this.container.style.left = '-9999px';
    this.container.style.top = '-9999px';
    document.body.appendChild(this.container);

    const stage = new Konva.Stage({
      container: this.container,
      width: this.width,
      height: this.height,
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    const background = new Konva.Rect({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      fill: this.backgroundColor,
    });
    layer.add(background);

    const group = new Konva.Group();
    layer.add(group);

    this.stage = stage;
    this.layer = layer;
    this.contentGroup = group;

    await this.ensureAudioInfrastructure();
    await this.createRenderers();

    const context = this.createFrameContext(0);
    for (const managed of this.managedRenderers) {
      managed.renderer.handlePlayingChange(false);
      managed.renderer.syncVisibility(0);
      managed.renderer.frameUpdate(context);
    }

    layer.draw();
  }

  getCanvas(): HTMLCanvasElement {
    if (!this.layer) {
      throw new Error('Preview export runtime is not initialised');
    }
    const canvas = this.layer.getNativeCanvasElement();
    if (!canvas) {
      throw new Error('Unable to access layer canvas for export');
    }
    return canvas;
  }

  async renderFrame(timestamp: number): Promise<void> {
    if (!this.layer) {
      throw new Error('Preview export runtime is not initialised');
    }

    const baseContext = this.createFrameContext(timestamp);

    for (const managed of this.managedRenderers) {
      const { renderer, segment } = managed;

      const segmentStart = segment.startTime;
      const segmentEnd = getSegmentEndTime(segment);
      const isActive = timestamp >= segmentStart && timestamp <= segmentEnd;

      const frameContext: RendererFrameContext = {
        ...baseContext,
        playing: isActive,
      };

      renderer.handlePlayingChange(isActive);
      renderer.syncVisibility(timestamp);
      if (isActive) {
        await renderer.prepareForFrame(timestamp);
      }
      if (segment.type === 'video' && renderer instanceof VideoRenderer) {
        await this.renderVideoSegmentFrame(renderer, segment as VideoElement, frameContext);
      } else {
        renderer.frameUpdate(frameContext);
      }
    }

    this.layer.batchDraw();
  }

  private async renderVideoSegmentFrame(
    renderer: VideoRenderer,
    segment: VideoElement,
    context: RendererFrameContext
  ): Promise<void> {
    renderer.frameUpdate(context);

    const segmentStart = segment.startTime;
    const segmentEnd = getSegmentEndTime(segment);
    if (context.timestamp < segmentStart || context.timestamp > segmentEnd) {
      return;
    }

    const source = await this.resolveVideoSource(segment);
    if (!source) {
      return;
    }

    const localTime = context.timestamp - segmentStart + segment.trimStart;
    if (localTime < 0) {
      return;
    }

    try {
      const frame = await videoCache.getFrameAt(segment.id, source, Math.max(localTime, 0));
      if (frame) {
        renderer.applyCachedFrame(frame);
      }
    } catch (error) {
      console.warn(`Failed to render video frame for ${segment.id}:`, error);
    }
  }

  private async resolveVideoSource(segment: VideoElement): Promise<File | Blob | string | null> {
    const cached = this.videoSources.get(segment.id);
    if (cached) {
      return cached;
    }

    if (segment.remoteSource) {
      this.videoSources.set(segment.id, segment.remoteSource);
      return segment.remoteSource;
    }

    if (segment.mediaId) {
      console.warn(`Missing remote source for video segment ${segment.id}`);
    }

    return null;
  }

  destroy(): void {
    for (const managed of this.managedRenderers) {
      if (managed.segment.type === 'video') {
        videoCache.clearVideo(managed.segment.id);
        this.videoSources.delete(managed.segment.id);
      }
      managed.renderer.destroy();
    }
    this.managedRenderers = [];
    this.videoSources.clear();

    if (this.analyzer) {
      try {
        this.analyzer.analyzer.disconnect();
      } catch (error) {
        console.warn('Failed to disconnect export analyzer', error);
      }
      this.analyzer = null;
    }

    if (this.audioContext) {
      const context = this.audioContext;
      this.audioContext = null;
      void context.close().catch((error) => {
        console.warn('Failed to close export audio context', error);
      });
    }

    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
    }

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.layer = null;
    this.contentGroup = null;
  }

  private createFrameContext(timestamp: number, playing = false): RendererFrameContext {
    return {
      timestamp,
      playing,
      stageSize: { width: this.width, height: this.height },
      scale: 1,
    };
  }

  private async createRenderers(): Promise<void> {
    if (!this.stage || !this.contentGroup) {
      throw new Error('Preview export runtime stage is not ready');
    }

    for (const segment of this.segments) {
      const renderer = await this.createRenderer(segment);
      if (!renderer) {
        continue;
      }
      this.managedRenderers.push({ renderer: renderer as BaseRenderer<TimelineElement>, segment });
    }
  }

  private async createRenderer(segment: TimelineElement): Promise<BaseRenderer<TimelineElement> | null> {
    if (!this.stage || !this.contentGroup) {
      return null;
    }

    const noopUpdate = async () => undefined;

    switch (segment.type) {
      case 'text':
        return this.initialiseRenderer(createTextRenderer({
          segment: segment as TextElement,
          stage: this.stage,
          container: this.contentGroup,
          updateSegment: noopUpdate,
        })) as Promise<BaseRenderer<TimelineElement>>;
      case 'subtitles':
        return this.initialiseRenderer(createSubtitleRenderer({
          segment: segment as TextElement,
          stage: this.stage,
          container: this.contentGroup,
          updateSegment: noopUpdate,
        })) as Promise<BaseRenderer<TimelineElement>>;
      case 'image':
        return this.initialiseRenderer(createImageRenderer({
          segment: segment as ImageElement,
          stage: this.stage,
          container: this.contentGroup,
          updateSegment: noopUpdate,
        })) as Promise<BaseRenderer<TimelineElement>>;
      case 'shape':
        return this.initialiseRenderer(createShapeRenderer({
          segment: segment as ShapeElement,
          stage: this.stage,
          container: this.contentGroup,
          updateSegment: noopUpdate,
        })) as Promise<BaseRenderer<TimelineElement>>;
      case 'progress_bar':
        return this.initialiseRenderer(createProgressBarRenderer({
          segment: segment as ProgressBarElement,
          stage: this.stage,
          container: this.contentGroup,
          updateSegment: noopUpdate,
        })) as Promise<BaseRenderer<TimelineElement>>;
      case 'wave':
        return this.initialiseRenderer(createWaveRenderer({
          segment: segment as WaveElement,
          stage: this.stage,
          container: this.contentGroup,
          updateSegment: noopUpdate,
          audioContext: this.audioContext ?? undefined,
          analyzer: this.analyzer ?? undefined,
        })) as Promise<BaseRenderer<TimelineElement>>;
      case 'video': {
        const renderer = createVideoRenderer({
          segment: segment as VideoElement,
          stage: this.stage,
          container: this.contentGroup,
          updateSegment: noopUpdate,
          audioContext: this.audioContext,
          analyzer: this.analyzer,
        });
        const initialised = await this.initialiseRenderer(renderer);
        if (initialised instanceof VideoRenderer) {
          initialised.handlePlayingChange(false);
        }
        return initialised as BaseRenderer<TimelineElement>;
      }
      case 'audio': {
        if (!this.audioContext || !this.analyzer) {
          return null;
        }
        return this.initialiseRenderer(createAudioRenderer({
          segment: segment as AudioElement,
          stage: this.stage,
          container: this.contentGroup,
          updateSegment: noopUpdate,
          audioContext: this.audioContext,
          analyzer: this.analyzer,
        })) as Promise<BaseRenderer<TimelineElement>>;
      }
      default:
        return null;
    }
  }

  private async initialiseRenderer<T extends TimelineElement>(renderer: BaseRenderer<T>): Promise<BaseRenderer<T>> {
    await renderer.initialize();
    renderer.handlePlayingChange(false);
    return renderer;
  }

  private async ensureAudioInfrastructure(): Promise<void> {
    const requiresAudio = this.segments.some((segment) =>
      segment.type === 'wave' || segment.type === 'video' || segment.type === 'audio'
    );
    if (!requiresAudio) {
      return;
    }

    if (this.audioContext && this.analyzer) {
      return;
    }

    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
      console.warn('AudioContext is unavailable; audio visualisations may be disabled in exports.');
      return;
    }

    let audioContext: AudioContext;
    try {
      audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    } catch (error) {
      console.warn('Failed to create export audio context', error);
      return;
    }

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        console.warn('Failed to resume export audio context', error);
      }
    }

    const analyzer = new SpectrumAnalyzer(audioContext);
    // Don't connect to destination during export to avoid audio playback
    // The analyzer will still receive and process audio data for visualization

    this.audioContext = audioContext;
    this.analyzer = analyzer;
  }
}
