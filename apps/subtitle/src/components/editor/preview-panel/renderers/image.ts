import Konva from 'konva';

import { ImageElement } from "@/types/timeline";

import { BaseRenderer, BaseRendererOptions } from './base';

export class ImageRenderer extends BaseRenderer<ImageElement> {
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

  protected onSegmentUpdated(segment: ImageElement, previous: ImageElement): void {
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

  private getSourceKey(segment: ImageElement): string | null {
    return segment.remoteSource ?? segment.mediaId ?? null;
  }

  private async loadImage(segment: ImageElement, node: Konva.Image): Promise<void> {
    const key = this.getSourceKey(segment);
    this.sourceKey = key;

    if (!this.mediaElement) {
      this.mediaElement = new Image();
      this.mediaElement.crossOrigin = 'anonymous';
    }

    const image = this.mediaElement;
    image.crossOrigin = 'anonymous';
    let sourceConfigured = false;

    if (segment.remoteSource) {
      image.src = segment.remoteSource;
      sourceConfigured = true;
    } else if (segment.mediaId) {
      console.warn(`Missing remote source for image segment ${segment.id}`);
      image.src = '';
    } else {
      image.src = '';
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

export function createImageRenderer(options: BaseRendererOptions<ImageElement>): ImageRenderer {
  return new ImageRenderer(options);
}
