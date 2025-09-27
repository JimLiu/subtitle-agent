import Konva from 'konva';

import { AudioElement } from "@/types/timeline";

import { SpectrumAnalyzer } from '../deps/spectrum-analyzer';
import { BaseRenderer, BaseRendererOptions } from './base';

export interface AudioRendererOptions extends BaseRendererOptions<AudioElement> {
  audioContext: AudioContext;
  analyzer: SpectrumAnalyzer;
}

export class AudioRenderer extends BaseRenderer<AudioElement> {
  private readonly audioContext: AudioContext;
  private readonly analyzer: SpectrumAnalyzer;
  private mediaElement: HTMLAudioElement | null = null;
  private sourceKey: string | null = null;

  constructor(options: AudioRendererOptions) {
    super(options);
    this.audioContext = options.audioContext;
    this.analyzer = options.analyzer;
  }

  protected async createNode(): Promise<Konva.Group> {
    await this.ensureMediaElement(this.segment);
    return new Konva.Group({
      id: this.segment.id,
      name: this.segment.id,
      visible: false,
      listening: false,
    });
  }

  protected onSegmentUpdated(segment: AudioElement, previous: AudioElement): void {
    if (segment.volume !== previous.volume && this.mediaElement) {
      this.mediaElement.volume = this.resolveVolume(segment.volume);
    }

    const nextKey = this.getSourceKey(segment);
    if (nextKey !== this.sourceKey) {
      void this.ensureMediaElement(segment);
    }
  }

  protected onTimeUpdate(timestamp: number): void {
    this.syncToTimestamp(timestamp, false);
  }

  protected onPlayingChange(isPlaying: boolean): void {
    const audio = this.mediaElement;
    if (!audio) {
      return;
    }
    if (isPlaying && this.visible) {
      audio.play().catch(() => undefined);
    } else if (!audio.paused) {
      audio.pause();
    }
  }

  protected show(): void {
    super.show();
    this.wrapper?.hide();
    if (this.mediaElement) {
      this.syncToTimestamp(this.currentTimestamp, true);
      if (this.playing) {
        this.mediaElement.play().catch(() => undefined);
      }
    }
  }

  protected hide(): void {
    if (this.mediaElement && !this.mediaElement.paused) {
      this.mediaElement.pause();
    }
    super.hide();
    this.wrapper?.hide();
  }

  protected onDestroy(): void {
    if (this.mediaElement) {
      this.mediaElement.pause();
      this.mediaElement.src = '';
      this.mediaElement.remove();
      this.mediaElement = null;
    }
  }

  private getSourceKey(segment: AudioElement): string | null {
    return segment.remoteSource ?? segment.mediaId ?? null;
  }

  private async ensureMediaElement(segment: AudioElement): Promise<void> {
    const key = this.getSourceKey(segment);
    this.sourceKey = key;

    if (!this.mediaElement) {
      this.mediaElement = document.createElement('audio');
      this.mediaElement.loop = true;
      this.mediaElement.crossOrigin = 'anonymous';
      this.mediaElement.classList.add('fft');
      document.body.append(this.mediaElement);
      try {
        this.audioContext.createMediaElementSource(this.mediaElement).connect(this.analyzer.analyzer);
      } catch (error) {
        console.warn('Failed to connect audio element to audio context', error);
      }
    }

    const audio = this.mediaElement;
    if (!key || !segment.remoteSource) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (segment.mediaId && !segment.remoteSource) {
        console.warn(`Missing remote source for audio segment ${segment.id}`);
      }
      return;
    }
    audio.pause();
    audio.removeAttribute('src');
    audio.src = segment.remoteSource;
    audio.volume = this.resolveVolume(segment.volume);
  }

  private syncToTimestamp(timestamp: number, force: boolean): void {
    const audio = this.mediaElement;
    if (!audio) {
      return;
    }
    if (this.playing && !force) {
      return;
    }
    const offset = timestamp - this.segment.startTime + this.segment.trimStart;
    const seconds = Number.isFinite(offset) ? offset / 1000 : 0;
    if (Math.abs(audio.currentTime - seconds) > 0.05) {
      audio.currentTime = seconds >= 0 ? seconds : 0;
    }
  }

  private resolveVolume(volume?: number): number {
    if (typeof volume !== 'number') {
      return 1;
    }
    return volume > 1 ? volume / 100 : volume;
  }
}

export function createAudioRenderer(options: AudioRendererOptions): AudioRenderer {
  return new AudioRenderer(options);
}
