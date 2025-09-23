import Konva from 'konva';

import { PreviewKonvaNode } from './preview-konva-node';
import { ShapeElement } from '@/types/timeline';

export class ShapePreviewNode extends PreviewKonvaNode<ShapeElement> {
  protected initKonvaObject(): void {
    const element = this.element;
    if (!element) {
      return;
    }

    const options = element.options ?? {};
    let shape: Konva.Shape;
    switch (element.shapeType) {
      case 'circle':
        shape = new Konva.Circle({
          radius: options.radius ?? 50,
          stroke: options.borderColor ?? '#000000',
          strokeWidth: options.borderWidth ?? 0,
        });
        break;
      case 'square':
        shape = new Konva.Rect({
          width: element.width,
          height: element.height,
          cornerRadius: options.cornerRadius ?? 0,
          stroke: options.borderColor ?? '#000000',
          strokeWidth: options.borderWidth ?? 0,
        });
        break;
      case 'triangle':
        shape = new Konva.RegularPolygon({
          sides: 3,
          radius: element.width / 2,
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
          radius: element.width / 2,
        });
        break;
      default:
        shape = new Konva.Rect({
          width: element.width,
          height: element.height,
        });
        break;
    }

    shape.setAttrs({
      x: element.x ?? 0,
      y: element.y ?? 0,
      fill: element.color,
      opacity: element.opacity,
      rotation: element.rotation,
      scaleX: element.scale?.x ?? 1,
      scaleY: element.scale?.y ?? 1,
      draggable: true,
      name: element.id,
    });

    shape.on('dragmove', () => {
      this.updateSegment({
        id: element.id,
        changes: {
          position: {
            x: shape.x(),
            y: shape.y(),
          },
        },
      } as unknown as Partial<ShapeElement> & { id: string });
    });

    this.konvaObject = shape;
  }
}
