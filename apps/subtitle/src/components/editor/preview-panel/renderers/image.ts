import Konva from 'konva';

import { openEchowaveDatabase, getFileFromStore } from '../deps/open-echowave-db';
import { ImageSegment } from '../deps/segment-types';
import { BaseRenderer, BaseRendererOptions } from './base';

export class ImageRenderer extends BaseRenderer<ImageSegment> {
  private mediaElement: HTMLImageElement | null = null;
  private sourceKey: string | null = null;

  protected async createNode(): Promise<Konva.Image> {
    const node = new Konva.Image({
      id: this.segment.id,
      name: this.segment.id,
      cornerRadius: this.segment.cornerRadius ?? 0,
    });

    await this.loadImage(this.segment, node);
    return node;
  }

  protected onSegmentUpdated(segment: ImageSegment, previous: ImageSegment): void {
    const node = this.node as Konva.Image | null;
    if (!node) {
      return;
    }

    if (segment.cornerRadius !== previous.cornerRadius) {
      node.cornerRadius(segment.cornerRadius ?? 0);
    }

    const nextKey = this.getSourceKey(segment);
    if (nextKey !== this.sourceKey) {
      void this.loadImage(segment, node);
    }
  }

  protected onDestroy(): void {
    if (this.mediaElement) {
      this.mediaElement.src = '';
      this.mediaElement = null;
    }
  }

  private getSourceKey(segment: ImageSegment): string | null {
    return segment.fileId ?? segment.remoteSource ?? null;
  }

  private async loadImage(segment: ImageSegment, node: Konva.Image): Promise<void> {
    const key = this.getSourceKey(segment);
    this.sourceKey = key;

    if (!this.mediaElement) {
      this.mediaElement = new Image();
      this.mediaElement.crossOrigin = 'anonymous';
    }

    const image = this.mediaElement;
    image.crossOrigin = 'anonymous';
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
                image.src = result;
              }
              resolve();
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          sourceConfigured = true;
        }
      } catch (error) {
        console.warn('Failed to load image blob', error);
      }
    }

    if (!sourceConfigured && segment.remoteSource) {
      image.src = segment.remoteSource;
      sourceConfigured = true;
    }

    if (!sourceConfigured) {
      node.image(image);
      return;
    }

    await new Promise<void>((resolve) => {
      const applyDimensions = () => {
        if (this.sourceKey !== key) {
          resolve();
          return;
        }
        node.image(image);
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (width && height) {
          node.width(width);
          node.height(height);
        }
        resolve();
      };
      if (image.complete && image.naturalWidth) {
        applyDimensions();
        return;
      }
      image.onload = () => {
        applyDimensions();
        image.onload = null;
      };
      image.onerror = () => {
        resolve();
        image.onerror = null;
      };
    });
  }
}

export function createImageRenderer(options: BaseRendererOptions<ImageSegment>): ImageRenderer {
  return new ImageRenderer(options);
}
