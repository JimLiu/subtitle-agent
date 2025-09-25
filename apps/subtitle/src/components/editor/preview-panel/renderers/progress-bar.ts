import Konva from 'konva';

import { progressRenderers } from '../deps/progress-renderers';
import { ProgressBarSegment } from '../deps/segment-types';
import { BaseRenderer, BaseRendererOptions, RendererFrameInfo } from './base';

export class ProgressBarRenderer extends BaseRenderer<ProgressBarSegment> {
  protected createNode(): Konva.Rect {
    const segment = this.segment;
    return new Konva.Rect({
      id: segment.id,
      name: segment.id,
      x: segment.position?.x ?? 0,
      y: segment.position?.y ?? 0,
      fill: (segment as unknown as { color?: string }).color ?? '#FFFFFF',
      opacity: segment.opacity,
      rotation: segment.rotation,
      scaleX: segment.scale?.x ?? 1,
      scaleY: segment.scale?.y ?? 1,
      width: segment.width ?? 100,
      height: segment.height ?? 20,
      barType: segment.barType,
      options: segment.options,
      draggable: true,
      sceneFunc: (context, shape) => {
        const barType = (shape.getAttr('barType') as string) ?? 'bar';
        const renderer = progressRenderers[barType] ?? progressRenderers.bar;
        const width = shape.getAttr('width') as number;
        const height = shape.getAttr('height') as number;
        const progress = shape.getAttr('progress') as number;
        const options = shape.getAttr('options') as ProgressBarSegment['options'];
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

  protected onSegmentUpdated(segment: ProgressBarSegment, previous: ProgressBarSegment): void {
    const node = this.node as Konva.Rect | null;
    if (!node) {
      return;
    }

    if (segment.width !== previous.width && segment.width) {
      node.width(segment.width);
    }
    if (segment.height !== previous.height && segment.height) {
      node.height(segment.height);
    }
    if (segment.barType !== previous.barType && segment.barType) {
      node.setAttr('barType', segment.barType);
    }
    if (segment.options && segment.options !== previous.options) {
      node.setAttr('options', segment.options);
    }

    const nextColor = (segment as unknown as { color?: string }).color;
    const prevColor = (previous as unknown as { color?: string }).color;
    if (nextColor && nextColor !== prevColor) {
      node.fill(nextColor);
    }
  }
}

export function createProgressBarRenderer(options: BaseRendererOptions<ProgressBarSegment>): ProgressBarRenderer {
  return new ProgressBarRenderer(options);
}
