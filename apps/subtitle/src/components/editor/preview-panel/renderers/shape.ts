import Konva from 'konva';

import { ShapeElement } from "@/types/timeline";

import { BaseRenderer, BaseRendererOptions } from './base';

/**
 * 基础形状渲染器：矩形、圆形、三角形、星形、六边形等。
 * - 根据 element.shapeType 创建不同 Konva.Shape；
 * - 支持边框、圆角、半径等属性更新。
 */
export class ShapeRenderer extends BaseRenderer<ShapeElement> {
  protected createNode(): Konva.Shape {
    const element = this.element;
    const options = element.options ?? {};
    const fill = element.color ?? '#FFFFFF';

    let shape: Konva.Shape;
    switch (element.shapeType) {
      case 'circle':
        shape = new Konva.Circle({
          radius: options.radius ?? Math.min(element.width, element.height) / 2,
        });
        break;
      case 'triangle':
        shape = new Konva.RegularPolygon({
          sides: 3,
          radius: Math.min(element.width, element.height) / 2,
        });
        break;
      case 'star':
        shape = new Konva.Star({
          numPoints: 5,
          innerRadius: element.width / 4,
          outerRadius: element.width / 2,
        });
        break;
      case 'hexagon':
        shape = new Konva.RegularPolygon({
          sides: 6,
          radius: Math.min(element.width, element.height) / 2,
        });
        break;
      case 'square':
      default:
        shape = new Konva.Rect({
          width: element.width,
          height: element.height,
          cornerRadius: options.cornerRadius ?? 0,
        });
        break;
    }

    shape.setAttrs({
      id: element.id,
      name: element.id,
      x: element.x ?? 0,
      y: element.y ?? 0,
      fill,
      opacity: element.opacity,
      rotation: element.rotation,
      scaleX: element.scale?.x ?? 1,
      scaleY: element.scale?.y ?? 1,
      draggable: true,
      stroke: options.borderColor ?? '#000000',
      strokeWidth: options.borderWidth ?? 0,
    });

    return shape;
  }

  protected onElementUpdated(element: ShapeElement, previous: ShapeElement): void {
    const node = this.node as Konva.Shape | null;
    if (!node) {
      return;
    }

    const nextFill = element.color;
    const prevFill = previous.color;
    if (nextFill && nextFill !== prevFill) {
      node.fill(nextFill);
    }

    const shapeAny = node as any;

    if (element.width !== previous.width && typeof shapeAny.width === 'function' && element.width) {
      shapeAny.width(element.width);
    }
    if (element.height !== previous.height && typeof shapeAny.height === 'function' && element.height) {
      shapeAny.height(element.height);
    }

    if (element.options) {
      if (
        element.options.cornerRadius !== previous.options?.cornerRadius &&
        typeof shapeAny.cornerRadius === 'function'
      ) {
        shapeAny.cornerRadius(element.options.cornerRadius ?? 0);
      }
      if (element.options.radius !== previous.options?.radius && typeof shapeAny.radius === 'function') {
        shapeAny.radius(element.options.radius ?? 0);
      }
      if (element.options.borderColor !== previous.options?.borderColor) {
        node.stroke(element.options.borderColor ?? '#000000');
      }
      if (element.options.borderWidth !== previous.options?.borderWidth) {
        node.strokeWidth(element.options.borderWidth ?? 0);
      }
    }
  }
}

export function createShapeRenderer(options: BaseRendererOptions<ShapeElement>): ShapeRenderer {
  return new ShapeRenderer(options);
}
