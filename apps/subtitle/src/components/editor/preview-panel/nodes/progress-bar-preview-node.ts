import Konva from 'konva';

import { progressRenderers } from '../lib/progress-renderers';
import { PreviewKonvaNode } from './preview-konva-node';
import { ProgressBarElement } from '@/types/timeline';

export class ProgressBarPreviewNode extends PreviewKonvaNode<ProgressBarElement> {
  private animationId: number | null = null;

  protected initKonvaObject(): void {
    const element = this.element;
    if (!element) {
      return;
    }

    this.konvaObject = new Konva.Rect({
      x: element.x ?? 0,
      y: element.y ?? 0,
      fill: element.color,
      opacity: element.opacity,
      rotation: element.rotation,
      scaleX: element.scale?.x ?? 1,
      scaleY: element.scale?.y ?? 1,
      width: element.width ?? 100,
      height: element.height ?? 20,
      draggable: true,
      name: element.id,
      barType: element.barType,
      options: element.options,
      sceneFunc: (context, shape) => {
        const barType = shape.getAttr('barType') as string;
        const renderer = progressRenderers[barType] ?? progressRenderers.bar;
        const width = shape.getAttr('width');
        const height = shape.getAttr('height');
        const progress = shape.getAttr('progress');
        const options = shape.getAttr('options');
        renderer.render(context as unknown as CanvasRenderingContext2D, {
          width,
          height,
          progress,
          options,
        });
      },
    });

    const update = () => {
      const node = this.konvaObject as Konva.Rect | null;
      if (!node) {
        return;
      }
      node.setAttr('progress', this.progress);
      this.animationId = requestAnimationFrame(update);
    };

    this.animationId = requestAnimationFrame(update);
  }

  destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    super.destroy();
  }
}
