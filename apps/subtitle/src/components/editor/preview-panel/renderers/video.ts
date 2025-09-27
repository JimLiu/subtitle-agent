import Konva from 'konva';

import type { WrappedCanvas } from 'mediabunny';

import { VideoElement } from "@/types/timeline";

import { SpectrumAnalyzer } from '../deps/spectrum-analyzer';
import { getSegmentEndTime } from '../deps/segment-helpers';
import { BaseRenderer, BaseRendererOptions, RendererFrameInfo } from './base';

export interface VideoRendererOptions extends BaseRendererOptions<VideoElement> {
  audioContext: AudioContext | null;
  analyzer: SpectrumAnalyzer | null;
}

export class VideoRenderer extends BaseRenderer<VideoElement> {
  private audioContext: AudioContext | null;
  private analyzer: SpectrumAnalyzer | null;
  private audioSource: MediaElementAudioSourceNode | null = null;
  private audioAttached = false;
  private mediaElement: HTMLVideoElement | null = null;

  constructor(options: VideoRendererOptions) {
    super(options);
    this.audioContext = options.audioContext;
    this.analyzer = options.analyzer;
  }

  protected async createNode(): Promise<Konva.Image> {
    const segment = this.segment;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.loop = true;
    video.volume = this.resolveVolume(segment.volume);

    this.mediaElement = video;

    let sourceConfigured = false;

    if (segment.remoteSource) {
      video.src = segment.remoteSource;
      sourceConfigured = true;
    } else if (segment.mediaId) {
      console.warn(`Missing remote source for video segment ${segment.id}`);
    }

    const node = new Konva.Image({
      image: video,
      cornerRadius: segment.cornerRadius ?? 0,
      id: segment.id,
      name: segment.id,
    });

    if (sourceConfigured) {
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) {
          node.width(video.videoWidth);
          node.height(video.videoHeight);
          resolve();
          return;
        }
        const onLoaded = () => {
          node.width(video.videoWidth);
          node.height(video.videoHeight);
          resolve();
        };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
      });
    }

    if (this.audioContext && this.analyzer) {
      this.attachAudio(this.audioContext, this.analyzer);
    } else {
      console.info('Preview video is running without audio context; audio playback may be muted.');
    }

    return node;
  }

  protected onSegmentUpdated(segment: VideoElement, _previous: VideoElement): void {
    const node = this.node as Konva.Image | null;
    if (!node) {
      return;
    }
    const video = this.mediaElement;
    if (segment.cornerRadius !== undefined) {
      node.cornerRadius(segment.cornerRadius ?? 0);
    }
    if (video && segment.volume !== undefined) {
      video.volume = this.resolveVolume(segment.volume);
    }
  }

  protected onPlayingChange(isPlaying: boolean): void {
    const video = this.mediaElement;
    if (!video) {
      return;
    }
    if (isPlaying && this.visible) {
      void video.play().catch(() => undefined);
    } else if (!video.paused) {
      video.pause();
    }
  }

  protected onTimeUpdate(timestamp: number): void {
    const video = this.mediaElement;

    if (!video) {
      return;
    }

    if (!this.playing) {
      const offset = timestamp - this.segment.startTime + this.segment.trimStart;
      if (offset >= 0 && Math.abs(video.currentTime - offset) > 0.05) {
        video.currentTime = offset;
      }
    }
    
    const layer = this.node?.getLayer();
    layer?.batchDraw();
  }

  protected onFrame(info: RendererFrameInfo): void {
    super.onFrame(info);

    const video = this.mediaElement;
    if (video && this.playing && this.visible && !video.paused && video.readyState >= 2) {
      const layer = this.node?.getLayer();
      layer?.batchDraw();
    }
  }

  protected show(): void {
    super.show();
    const video = this.mediaElement;
    if (!video) {
      return;
    }
    this.onTimeUpdate(this.currentTimestamp);
    if (this.playing) {
      void video.play().catch(() => undefined);
    }
  }

  protected hide(): void {
    const video = this.mediaElement;
    if (video && !video.paused) {
      video.pause();
    }
    super.hide();
  }

  protected onDestroy(): void {
    const video = this.mediaElement;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch (error) {
        console.warn('Failed to disconnect video audio source', error);
      }
      this.audioSource = null;
      this.audioAttached = false;
    }
    this.mediaElement = null;
  }

  ensureAudioContext(audioContext: AudioContext, analyzer: SpectrumAnalyzer): void {
    this.audioContext = audioContext;
    this.analyzer = analyzer;
    if (!this.audioAttached && this.mediaElement) {
      this.attachAudio(audioContext, analyzer);
    }
  }

  applyCachedFrame(frame: WrappedCanvas): void {
    const node = this.node as Konva.Image | null;
    if (!node) {
      return;
    }

    const canvasSource = frame.canvas as CanvasImageSource;
    node.image(canvasSource);

    if ('width' in frame.canvas && typeof frame.canvas.width === 'number') {
      const width = frame.canvas.width;
      if (Number.isFinite(width) && width > 0) {
        node.width(width);
      }
    }

    if ('height' in frame.canvas && typeof frame.canvas.height === 'number') {
      const height = frame.canvas.height;
      if (Number.isFinite(height) && height > 0) {
        node.height(height);
      }
    }

    const layer = node.getLayer();
    layer?.batchDraw();
  }

  async prepareForFrame(timestamp: number): Promise<void> {
    if (!this.mediaElement) {
      return;
    }
    const endTime = getSegmentEndTime(this.segment);
    if (timestamp < this.segment.startTime || timestamp > endTime) {
      return;
    }
    await this.seekToTimestamp(timestamp);
  }

  private attachAudio(audioContext: AudioContext, analyzer: SpectrumAnalyzer): void {
    if (this.audioAttached || !this.mediaElement) {
      return;
    }
    try {
      this.audioSource = audioContext.createMediaElementSource(this.mediaElement);
      this.audioSource.connect(analyzer.analyzer);
      // Note: analyzer is not connected to destination in export mode,
      // so audio will be processed for visualization but not played
      this.audioAttached = true;
    } catch (error) {
      console.warn('Failed to connect video element to audio context', error);
    }
  }

  private async seekToTimestamp(timestamp: number): Promise<void> {
    const video = this.mediaElement;
    if (!video) {
      return;
    }

    await this.ensureMetadata(video);

    const segmentStart = this.segment.startTime ?? 0;
    const segmentTrim = this.segment.trimStart;
    const offset = timestamp - segmentStart + segmentTrim;
    if (!Number.isFinite(offset) || offset < 0) {
      return;
    }

    const current = video.currentTime;
    const ready = video.readyState >= 2;
    if (ready && Math.abs(current - offset) <= 0.01) {
      return;
    }

    await this.seekVideo(video, offset);
    // await this.waitForVideoFrame(video);

    const layer = this.node?.getLayer();
    layer?.batchDraw();
  }

  private async ensureMetadata(video: HTMLVideoElement): Promise<void> {
    if (video.readyState >= 1 && Number.isFinite(video.duration)) {
      return;
    }
    await new Promise<void>((resolve) => {
      if (video.readyState >= 1) {
        resolve();
        return;
      }
      const handleLoaded = () => {
        video.removeEventListener('loadedmetadata', handleLoaded);
        resolve();
      };
      video.addEventListener('loadedmetadata', handleLoaded, { once: true });
    });
  }

  private seekVideo(video: HTMLVideoElement, targetSeconds: number): Promise<void> {
    return new Promise((resolve) => {
      const cleanup = () => {
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadeddata', handleSeeked);
      };

      const handleSeeked = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        resolve();
      };

      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
      const safeTarget = duration ? Math.max(0, Math.min(targetSeconds, duration - 1e-3)) : Math.max(0, targetSeconds);
      const delta = Math.abs(video.currentTime - safeTarget);
      if (delta <= 0.005 && video.readyState >= 2) {
        cleanup();
        resolve();
        return;
      }

      video.addEventListener('seeked', handleSeeked, { once: true });
      video.addEventListener('error', handleError, { once: true });

      try {
        video.currentTime = safeTarget;
        if (delta <= 0.005 && video.readyState < 2) {
          video.addEventListener('loadeddata', handleSeeked, { once: true });
        }
      } catch (error) {
        console.warn('Failed to seek video element', error);
        cleanup();
        resolve();
      }
    });
  }

  private async waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
    const request = (video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: (now: number, metadata: VideoFrameCallbackMetadata) => void) => number;
    }).requestVideoFrameCallback;

    if (typeof request === 'function') {
      await new Promise<void>((resolve) => {
        request.call(video, (() => resolve()) as (now: number, metadata: VideoFrameCallbackMetadata) => void);
      });
      return;
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }

  private resolveVolume(volume?: number): number {
    if (typeof volume !== 'number') {
      return 1;
    }
    return volume > 1 ? volume / 100 : volume;
  }
}

export function createVideoRenderer(options: VideoRendererOptions): VideoRenderer {
  return new VideoRenderer(options);
}
