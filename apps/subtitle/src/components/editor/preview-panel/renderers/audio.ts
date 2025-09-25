import Konva from 'konva';

import { openEchowaveDatabase, getFileFromStore } from '../deps/open-echowave-db';
import { SpectrumAnalyzer } from '../deps/spectrum-analyzer';
import { AudioSegment } from '../deps/segment-types';
import { BaseRenderer, BaseRendererOptions } from './base';

export interface AudioRendererOptions extends BaseRendererOptions<AudioSegment> {
  audioContext: AudioContext;
  analyzer: SpectrumAnalyzer;
}

export class AudioRenderer extends BaseRenderer<AudioSegment> {
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

  protected onSegmentUpdated(segment: AudioSegment, previous: AudioSegment): void {
    if (segment.volume !== previous.volume && this.mediaElement) {
      this.mediaElement.volume = (segment.volume ?? 100) / 100;
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

  private getSourceKey(segment: AudioSegment): string | null {
    return segment.fileId ?? segment.remoteSource ?? null;
  }

  private async ensureMediaElement(segment: AudioSegment): Promise<void> {
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
    if (!key) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    audio.pause();
    audio.removeAttribute('src');

    let sourceConfigured = false;

    if (segment.fileId) {
      try {
        const database = await openEchowaveDatabase();
        const transaction = database.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const blob = await getFileFromStore(store, segment.fileId);
        if (blob) {
          await new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const result = event.target?.result;
              if (typeof result === 'string') {
                audio.src = result;
                audio.volume = (segment.volume ?? 100) / 100;
              }
              resolve();
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          sourceConfigured = true;
        }
      } catch (error) {
        console.warn('Failed to load audio blob', error);
      }
    }

    if (!sourceConfigured && segment.remoteSource) {
      audio.src = segment.remoteSource;
      audio.volume = (segment.volume ?? 100) / 100;
      sourceConfigured = true;
    }

    if (!sourceConfigured) {
      audio.removeAttribute('src');
    }
  }

  private syncToTimestamp(timestamp: number, force: boolean): void {
    const audio = this.mediaElement;
    if (!audio) {
      return;
    }
    if (this.playing && !force) {
      return;
    }
    const offset = timestamp - (this.segment.startTime ?? 0) + (this.segment.cut ?? 0);
    const seconds = Number.isFinite(offset) ? offset / 1000 : 0;
    if (Math.abs(audio.currentTime - seconds) > 0.05) {
      audio.currentTime = seconds >= 0 ? seconds : 0;
    }
  }
}

export function createAudioRenderer(options: AudioRendererOptions): AudioRenderer {
  return new AudioRenderer(options);
}
