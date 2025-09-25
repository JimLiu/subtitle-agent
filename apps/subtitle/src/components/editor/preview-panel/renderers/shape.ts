import Konva from 'konva';

import { ShapeSegment } from '../deps/segment-types';
import { BaseRenderer, BaseRendererOptions } from './base';

export class ShapeRenderer extends BaseRenderer<ShapeSegment> {
  protected createNode(): Konva.Shape {
    const segment = this.segment;
    const options = segment.options ?? {};
    const fill = (segment as unknown as { color?: string }).color ?? '#FFFFFF';

    let shape: Konva.Shape;
    switch (segment.shapeType) {
      case 'circle':
        shape = new Konva.Circle({
          radius: options.radius ?? Math.min(segment.width, segment.height) / 2,
        });
        break;
      case 'triangle':
        shape = new Konva.RegularPolygon({
          sides: 3,
          radius: Math.min(segment.width, segment.height) / 2,
        });
        break;
      case 'star':
        shape = new Konva.Star({
          numPoints: 5,
          innerRadius: segment.width / 4,
          outerRadius: segment.width / 2,
        });
        break;
      case 'hexagon':
        shape = new Konva.RegularPolygon({
          sides: 6,
          radius: Math.min(segment.width, segment.height) / 2,
        });
        break;
      case 'square':
      default:
        shape = new Konva.Rect({
          width: segment.width,
          height: segment.height,
          cornerRadius: options.cornerRadius ?? 0,
        });
        break;
    }

    shape.setAttrs({
      id: segment.id,
      name: segment.id,
      x: segment.position?.x ?? 0,
      y: segment.position?.y ?? 0,
      fill,
      opacity: segment.opacity,
      rotation: segment.rotation,
      scaleX: segment.scale?.x ?? 1,
      scaleY: segment.scale?.y ?? 1,
      draggable: true,
      stroke: options.borderColor ?? '#000000',
      strokeWidth: options.borderWidth ?? 0,
    });

    return shape;
  }

  protected onSegmentUpdated(segment: ShapeSegment, previous: ShapeSegment): void {
    const node = this.node as Konva.Shape | null;
    if (!node) {
      return;
    }

    const nextFill = (segment as unknown as { color?: string }).color;
    const prevFill = (previous as unknown as { color?: string }).color;
    if (nextFill && nextFill !== prevFill) {
      node.fill(nextFill);
    }

    const shapeAny = node as any;

    if (segment.width !== previous.width && typeof shapeAny.width === 'function' && segment.width) {
      shapeAny.width(segment.width);
    }
    if (segment.height !== previous.height && typeof shapeAny.height === 'function' && segment.height) {
      shapeAny.height(segment.height);
    }

    if (segment.options) {
      if (
        segment.options.cornerRadius !== previous.options?.cornerRadius &&
        typeof shapeAny.cornerRadius === 'function'
      ) {
        shapeAny.cornerRadius(segment.options.cornerRadius ?? 0);
      }
      if (segment.options.radius !== previous.options?.radius && typeof shapeAny.radius === 'function') {
        shapeAny.radius(segment.options.radius ?? 0);
      }
      if (segment.options.borderColor !== previous.options?.borderColor) {
        node.stroke(segment.options.borderColor ?? '#000000');
      }
      if (segment.options.borderWidth !== previous.options?.borderWidth) {
        node.strokeWidth(segment.options.borderWidth ?? 0);
      }
    }
  }
}

export function createShapeRenderer(options: BaseRendererOptions<ShapeSegment>): ShapeRenderer {
  return new ShapeRenderer(options);
}
