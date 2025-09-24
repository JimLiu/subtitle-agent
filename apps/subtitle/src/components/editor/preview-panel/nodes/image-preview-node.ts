import Konva from 'konva';

import { PreviewKonvaNode } from './preview-konva-node';
import { ImageElement } from '@/types/timeline';
import { useMediaStore } from '@/stores/media-store';

export class ImagePreviewNode extends PreviewKonvaNode<ImageElement> {
  private objectUrl: string | null = null;

  protected async initKonvaObject(): Promise<void> {
    const element = this.element;
    if (!element) {
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    this.mediaElement = image as unknown as HTMLMediaElement;

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
      image.src = sourceUrl;
    } else if (element.remoteSource) {
      image.src = element.remoteSource;
    } else {
      console.warn('No file found for image element');
    }

    this.konvaObject = new Konva.Image({
      image,
      cornerRadius: element.cornerRadius ?? 0,
    });
  }

  destroy(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    super.destroy();
  }
}
