import Konva from 'konva';

import { SpectrumAnalyzer } from '../lib/spectrum-analyzer';
import { openEchowaveDatabase, getFileFromStore } from '../lib/open-echowave-db';
import { PreviewKonvaNode, PreviewKonvaNodeConstructorOptions } from './preview-konva-node';
import { VideoElement } from '@/types/timeline';

interface VideoPreviewNodeOptions extends PreviewKonvaNodeConstructorOptions<VideoElement> {
  audioContext?: AudioContext | null;
  analyzer?: SpectrumAnalyzer | null;
}

export class VideoPreviewNode extends PreviewKonvaNode<VideoElement> {
  private readonly audioContext?: AudioContext | null;

  private readonly analyzer?: SpectrumAnalyzer | null;

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

    const database = await openEchowaveDatabase();
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.loop = true;
    this.mediaElement = video;

    let sourceBlob: Blob | null = null;
    if (element.mediaId) {
      const transaction = database.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');
      sourceBlob = await getFileFromStore(store, element.mediaId);
    }

    if (sourceBlob) {
      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result;
          if (typeof result === 'string') {
            video.src = result;
            video.volume = (element.volume ?? 100) / 100;
          }
          resolve();
        };
        reader.readAsDataURL(sourceBlob);
      });
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
    super.destroy();
  }
}
