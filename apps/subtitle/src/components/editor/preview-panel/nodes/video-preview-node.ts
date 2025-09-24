import Konva from 'konva';

import { SpectrumAnalyzer } from '../lib/spectrum-analyzer';
import { PreviewKonvaNode, PreviewKonvaNodeConstructorOptions } from './preview-konva-node';
import { VideoElement } from '@/types/timeline';
import { useMediaStore } from '@/stores/media-store';

interface VideoPreviewNodeOptions extends PreviewKonvaNodeConstructorOptions<VideoElement> {
  audioContext?: AudioContext | null;
  analyzer?: SpectrumAnalyzer | null;
}

export class VideoPreviewNode extends PreviewKonvaNode<VideoElement> {
  private readonly audioContext?: AudioContext | null;

  private readonly analyzer?: SpectrumAnalyzer | null;

  private objectUrl: string | null = null;

  constructor(options: VideoPreviewNodeOptions) {
    super(options);
    this.audioContext = options.audioContext ?? null;
    this.analyzer = options.analyzer ?? null;
  }

  protected async initKonvaObject(): Promise<void> {
    const element = this.element;
    if (!element || !this.audioContext || !this.analyzer) {
      return;
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.loop = true;
    this.mediaElement = video;

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
      video.src = sourceUrl;
      video.volume = (element.volume ?? 100) / 100;
    } else if (element.remoteSource) {
      video.src = element.remoteSource;
      video.volume = (element.volume ?? 100) / 100;
    } else {
      console.warn('No file found for video element');
    }

    this.konvaObject = new Konva.Image({
      image: video,
      cornerRadius: element.cornerRadius ?? 0,
    });

    video.addEventListener(
      'loadedmetadata',
      () => {
        this.konvaObject?.width(video.videoWidth);
        this.konvaObject?.height(video.videoHeight);
        this.calculateShowHide();
      },
      { once: true },
    );

    this.audioContext.createMediaElementSource(video).connect(this.analyzer.analyzer);
  }

  protected hideCallback(): void {
    const video = this.mediaElement as HTMLVideoElement | null;
    if (video && !video.paused) {
      video.pause();
    }
  }

  protected showCallback(): void {
    this.sync(this.currentTimestamp);
    const video = this.mediaElement as HTMLVideoElement | null;
    if (this.playing && video && video.paused) {
      video.play().catch(() => undefined);
    }
  }

  protected onPlayingChange(next: boolean, previous: boolean): void {
    if (next === previous) {
      return;
    }
    const video = this.mediaElement as HTMLVideoElement | null;
    if (!video) {
      return;
    }
    if (next && this.visible) {
      video.play().catch(() => undefined);
    } else if (!video.paused) {
      video.pause();
    }
  }

  protected sync(timestamp: number): void {
    const element = this.element;
    const video = this.mediaElement as HTMLVideoElement | null;
    if (!element || !video || this.playing) {
      return;
    }
    const offset = timestamp / 1000 - element.startTime / 1000 + (element.trimStart ?? 0) / 1000;
    video.currentTime = offset;
  }

  destroy(): void {
    if (this.mediaElement) {
      this.mediaElement.remove();
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    super.destroy();
  }
}
