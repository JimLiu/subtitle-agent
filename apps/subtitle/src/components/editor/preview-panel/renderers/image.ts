import Konva from 'konva';

import { ImageElement } from "@/types/timeline";

import { BaseRenderer, BaseRendererOptions } from './base';

/** 图片渲染器：通过 HTMLImageElement 加载媒体并绑定到 Konva.Image。 */
export class ImageRenderer extends BaseRenderer<ImageElement> {
  private mediaElement: HTMLImageElement | null = null;
  private sourceKey: string | null = null;

  protected async createNode(): Promise<Konva.Image> {
    const node = new Konva.Image({
      id: this.element.id,
      name: this.element.id,
      cornerRadius: this.element.cornerRadius ?? 0,
    });

    await this.loadImage(this.element, node);
    return node;
  }

  protected onElementUpdated(element: ImageElement, previous: ImageElement): void {
    const node = this.node as Konva.Image | null;
    if (!node) {
      return;
    }

    if (element.cornerRadius !== previous.cornerRadius) {
      node.cornerRadius(element.cornerRadius ?? 0);
    }

    const nextKey = this.getSourceKey(element);
    if (nextKey !== this.sourceKey) {
      void this.loadImage(element, node);
    }
  }

  protected onDestroy(): void {
    if (this.mediaElement) {
      this.mediaElement.src = '';
      this.mediaElement = null;
    }
  }

  private getSourceKey(element: ImageElement): string | null {
    return element.remoteSource ?? element.mediaId ?? null;
  }

  private async loadImage(element: ImageElement, node: Konva.Image): Promise<void> {
    const key = this.getSourceKey(element);
    this.sourceKey = key;

    if (!this.mediaElement) {
      this.mediaElement = new Image();
      this.mediaElement.crossOrigin = 'anonymous';
    }

    const image = this.mediaElement;
    image.crossOrigin = 'anonymous';
    let sourceConfigured = false;

    if (element.remoteSource) {
      image.src = element.remoteSource;
      sourceConfigured = true;
    } else if (element.mediaId) {
      console.warn(`Missing remote source for image element ${element.id}`);
      image.src = '';
    } else {
      image.src = '';
    }

    if (!sourceConfigured) {
      node.image(image);
      return;
    }

    await new Promise<void>((resolve) => {
      // 等待图片尺寸就绪后再设置到节点，避免 0x0 尺寸
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
