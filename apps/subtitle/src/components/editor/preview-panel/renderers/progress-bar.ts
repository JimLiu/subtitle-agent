import Konva from 'konva';

import { ProgressBarElement } from "@/types/timeline";

import { progressRenderers } from '../deps/progress-renderers';
import { BaseRenderer, BaseRendererOptions, RendererFrameInfo } from './base';

/** 进度条渲染器：支持 bar/circle 等样式，按本地进度百分比绘制。 */
export class ProgressBarRenderer extends BaseRenderer<ProgressBarElement> {
  protected createNode(): Konva.Rect {
    const element = this.element;
    return new Konva.Rect({
      id: element.id,
      name: element.id,
      x: element.x ?? 0,
      y: element.y ?? 0,
      fill: element.color ?? '#FFFFFF',
      opacity: element.opacity,
      rotation: element.rotation,
      scaleX: element.scale?.x ?? 1,
      scaleY: element.scale?.y ?? 1,
      width: element.width ?? 100,
      height: element.height ?? 20,
      barType: element.barType,
      options: element.options,
      draggable: true,
      sceneFunc: (context, shape) => {
        const barType = (shape.getAttr('barType') as string) ?? 'bar';
        const renderer = progressRenderers[barType] ?? progressRenderers.bar;
        const width = shape.getAttr('width') as number;
        const height = shape.getAttr('height') as number;
        const progress = shape.getAttr('progress') as number;
        const options = shape.getAttr('options') as ProgressBarElement['options'];
        renderer.render(context as unknown as CanvasRenderingContext2D, {
          width,
          height,
          progress,
          options,
        });
      },
    });
  }

  protected onFrame(info: RendererFrameInfo): void {
    const node = this.node as Konva.Rect | null;
    if (!node) {
      return;
    }
    node.setAttr('progress', info.progress);
  }

  protected onElementUpdated(element: ProgressBarElement, previous: ProgressBarElement): void {
    const node = this.node as Konva.Rect | null;
    if (!node) {
      return;
    }

    if (element.width !== previous.width && element.width) {
      node.width(element.width);
    }
    if (element.height !== previous.height && element.height) {
      node.height(element.height);
    }
    if (element.barType !== previous.barType && element.barType) {
      node.setAttr('barType', element.barType);
    }
    if (element.options && element.options !== previous.options) {
      node.setAttr('options', element.options);
    }

    const nextColor = element.color;
    const prevColor = previous.color;
    if (nextColor && nextColor !== prevColor) {
      node.fill(nextColor);
    }
  }
}

export function createProgressBarRenderer(options: BaseRendererOptions<ProgressBarElement>): ProgressBarRenderer {
  return new ProgressBarRenderer(options);
}
