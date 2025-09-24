
import { SpectrumAnalyzer } from '../lib/spectrum-analyzer';
import { PreviewKonvaNode, PreviewKonvaNodeConstructorOptions } from './preview-konva-node';
import { AudioElement } from '@/types/timeline';
import { useMediaStore } from '@/stores/media-store';

interface AudioPreviewNodeOptions extends PreviewKonvaNodeConstructorOptions<AudioElement> {
  audioContext?: AudioContext | null;
  analyzer?: SpectrumAnalyzer | null;
  addBuffering?: (id: string) => void;
  removeBuffering?: (id: string) => void;
}

export class AudioPreviewNode extends PreviewKonvaNode<AudioElement> {
  private readonly audioContext?: AudioContext | null;

  private readonly analyzer?: SpectrumAnalyzer | null;

  private readonly addBuffering?: (id: string) => void;

  private readonly removeBuffering?: (id: string) => void;

  private objectUrl: string | null = null;

  constructor(options: AudioPreviewNodeOptions) {
    super(options);
    this.audioContext = options.audioContext ?? null;
    this.analyzer = options.analyzer ?? null;
    this.addBuffering = options.addBuffering;
    this.removeBuffering = options.removeBuffering;
  }

  protected async initKonvaObject(): Promise<void> {
    const element = this.element;
    if (!element || !this.audioContext || !this.analyzer) {
      return;
    }

    const audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous';
    audio.classList.add('fft');
    audio.loop = true;
    this.mediaElement = audio;
    document.body.append(audio);

    this.objectUrl = null;
    let sourceUrl: string | null = null;
    if (element.mediaId) {
      const { mediaFiles } = useMediaStore.getState();
      const mediaItem = mediaFiles.find((item) => item.id === element.mediaId);
      if (mediaItem?.file) {
        if (mediaItem.url) {
          sourceUrl = mediaItem.url;
        } else {
          sourceUrl = URL.createObjectURL(mediaItem.file);
          this.objectUrl = sourceUrl;
        }
      }
    }

    if (sourceUrl) {
      audio.src = sourceUrl;
      audio.volume = (element.volume ?? 100) / 100;
    } else if (element.remoteSource) {
      audio.src = element.remoteSource;
      audio.volume = (element.volume ?? 100) / 100;
    } else {
      console.warn('No file found for audio element');
    }

    this.audioContext.createMediaElementSource(audio).connect(this.analyzer.analyzer);
  }

  protected hideCallback(): void {
    const audio = this.mediaElement as HTMLAudioElement | null;
    if (audio && !audio.paused) {
      audio.pause();
    }
    this.removeBuffering?.(this.id);
  }

  protected showCallback(): void {
    this.sync(this.currentTimestamp, true);
    const audio = this.mediaElement as HTMLAudioElement | null;
    if (this.playing && audio?.paused) {
      audio.play().catch(() => undefined);
    }
  }

  protected onPlayingChange(next: boolean, previous: boolean): void {
    if (next === previous) {
      return;
    }
    const audio = this.mediaElement as HTMLAudioElement | null;
    if (!audio) {
      return;
    }
    if (next && this.visible) {
      audio.play().catch(() => undefined);
    } else if (!audio.paused) {
      audio.pause();
    }
  }

  protected sync(timestamp: number, force = false): void {
    const element = this.element;
    const audio = this.mediaElement as HTMLAudioElement | null;
    if (!element || !audio || (!force && this.playing)) {
      return;
    }
    const offset = timestamp / 1000 - element.startTime / 1000 + (element.trimStart ?? 0) / 1000;
    audio.currentTime = Number.isFinite(offset) ? offset : 0;
  }

  destroy(): void {
    this.mediaElement?.remove();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    super.destroy();
  }
}
