import Konva from 'konva';

import { openEchowaveDatabase, getFileFromStore } from '../lib/open-echowave-db';
import { PreviewKonvaNode } from './preview-konva-node';
import { ImageElement } from '@/types/timeline';

export class ImagePreviewNode extends PreviewKonvaNode<ImageElement> {
  protected async initKonvaObject(): Promise<void> {
    const element = this.element;
    if (!element) {
      return;
    }

    const database = await openEchowaveDatabase();
    const image = new Image();
    image.crossOrigin = 'anonymous';
    this.mediaElement = image as unknown as HTMLMediaElement;

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
            image.src = result;
          }
          resolve();
        };
        reader.readAsDataURL(sourceBlob);
      });
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
}
