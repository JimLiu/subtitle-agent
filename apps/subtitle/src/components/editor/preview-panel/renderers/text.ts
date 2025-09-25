import Konva from 'konva';
import WebFont from 'webfontloader';

import { TextSegment } from '../deps/segment-types';
import { BaseRenderer, BaseRendererOptions } from './base';

interface ShadowProps {
  color: string;
  opacity: number;
}

function parseShadowColor(value?: string): ShadowProps | null {
  if (!value || value.length < 9) {
    return null;
  }
  const color = value.substring(0, 7);
  const alphaHex = value.substring(7, 9);
  const alpha = Number.parseInt(alphaHex, 16);
  if (Number.isNaN(alpha)) {
    return null;
  }
  const opacity = alpha / 255;
  return { color, opacity };
}

export class TextRenderer extends BaseRenderer<TextSegment> {
  private currentFontFamily?: string;

  constructor(options: BaseRendererOptions<TextSegment>) {
    super(options);
    this.currentFontFamily = options.segment.font?.family;
  }

  protected createNode(): Konva.Text {
    const segment = this.segment;
    const fontFamily = segment.font?.family ?? 'Arial, sans-serif';
    this.loadFont(fontFamily);

    const shadow = parseShadowColor(segment.options?.shadowColor);

    return new Konva.Text({
      id: segment.id,
      text: segment.text ?? '',
      x: segment.position?.x ?? 0,
      y: segment.position?.y ?? 0,
      fill: (segment as unknown as { color?: string }).color ?? '#ffffff',
      opacity: segment.opacity,
      rotation: segment.rotation,
      scaleX: segment.scale?.x ?? 1,
      scaleY: segment.scale?.y ?? 1,
      width: segment.width ?? 100,
      fontSize: segment.fontSize ?? 20,
      letterSpacing: segment.letterSpacing ?? 0,
      align: segment.align ?? 'left',
      lineHeight: segment.lineHeight ?? 1,
      fontFamily,
      strokeWidth: segment.strokeWidth ?? 0,
      stroke: segment.options?.stokeColor ?? '#FFFFFF',
      shadowBlur: segment.shadowBlur ?? 0,
      shadowOffsetX: segment.shadowOffsetX ?? 0,
      shadowOffsetY: segment.shadowOffsetY ?? 0,
      verticalAlign: segment.verticalAlign ?? 'middle',
      shadowColor: shadow?.color,
      shadowOpacity: shadow?.opacity,
      fontStyle: this.getFontStyle(segment),
      textDecoration: this.getTextDecoration(segment),
      fillAfterStrokeEnabled: true,
      lineJoin: 'round',
    });
  }

  protected onNodeReady(node: Konva.Node): void {
    if (!(node instanceof Konva.Text)) {
      return;
    }
    node.on('dblclick dbltap', this.handleTextEdit);
  }

  protected onSegmentUpdated(segment: TextSegment, _previous: TextSegment): void {
    const node = this.node as Konva.Text | null;
    if (!node) {
      return;
    }

    if (segment.text !== undefined) {
      node.text(segment.text ?? '');
    }
    if (segment.width !== undefined) {
      node.width(segment.width ?? node.width());
    }
    if (typeof segment.height === 'number') {
      node.height(segment.height);
    }
    if (segment.fontSize !== undefined) {
      node.fontSize(segment.fontSize ?? node.fontSize());
    }
    if (segment.letterSpacing !== undefined) {
      node.letterSpacing(segment.letterSpacing ?? 0);
    }
    if (segment.align !== undefined) {
      node.align(segment.align ?? 'left');
    }
    if (segment.lineHeight !== undefined) {
      node.lineHeight(segment.lineHeight ?? 1);
    }
    if (segment.strokeWidth !== undefined) {
      node.strokeWidth(segment.strokeWidth ?? 0);
    }
    if (segment.shadowBlur !== undefined) {
      node.shadowBlur(segment.shadowBlur ?? 0);
    }
    if (segment.shadowOffsetX !== undefined) {
      node.shadowOffsetX(segment.shadowOffsetX ?? 0);
    }
    if (segment.shadowOffsetY !== undefined) {
      node.shadowOffsetY(segment.shadowOffsetY ?? 0);
    }
    if (segment.verticalAlign !== undefined) {
      node.verticalAlign(segment.verticalAlign ?? node.verticalAlign());
    }

    const shadow = parseShadowColor(segment.options?.shadowColor);
    if (shadow) {
      node.shadowColor(shadow.color);
      node.shadowOpacity(shadow.opacity);
    } else if (!segment.options?.shadowColor) {
      node.shadowOpacity(0);
    }

    if (segment.options && Object.prototype.hasOwnProperty.call(segment.options, 'stokeColor')) {
      node.stroke(segment.options.stokeColor ?? '#FFFFFF');
    }

    if ((segment as unknown as { color?: string }).color) {
      node.fill((segment as unknown as { color?: string }).color ?? '#ffffff');
    }

    node.fontStyle(this.getFontStyle(segment));
    node.textDecoration(this.getTextDecoration(segment));

    const nextFont = segment.font?.family;
    if (nextFont && nextFont !== this.currentFontFamily) {
      this.currentFontFamily = nextFont;
      this.loadFont(nextFont);
    }
  }

  protected onTransform(event: Konva.KonvaEventObject<Event>): boolean {
    const node = this.node as Konva.Text | null;
    if (!node) {
      return false;
    }
    const width = Math.max(node.width() * node.scaleX(), 30);
    const height = Math.max(node.height() * node.scaleY(), 30);
    node.setAttrs({ width, height, scaleX: 1, scaleY: 1 });
    this.updateSegment({ width, height });
    return false;
  }

  protected onDestroy(): void {
    const node = this.node as Konva.Text | null;
    node?.off('dblclick dbltap', this.handleTextEdit);
  }

  private loadFont(family: string): void {
    WebFont.load({
      google: { families: [family] },
      active: () => {
        const node = this.node as Konva.Text | null;
        if (node) {
          node.fontFamily(family);
          node.getLayer()?.batchDraw();
        }
      },
      inactive: () => {
        const node = this.node as Konva.Text | null;
        if (node) {
          node.fontFamily('Arial, sans-serif');
          node.getLayer()?.batchDraw();
        }
      },
      timeout: 5000,
    });
  }

  private getFontStyle(segment: TextSegment): string {
    const bold = Boolean(segment.bold);
    const italic = Boolean(segment.italic);
    if (bold && italic) {
      return 'italic bold';
    }
    if (bold) {
      return 'bold';
    }
    if (italic) {
      return 'italic';
    }
    return 'normal';
  }

  private getTextDecoration(segment: TextSegment): string {
    const underline = Boolean(segment.underline);
    const strike = Boolean(segment.strikethrough);
    if (underline && strike) {
      return 'underline line-through';
    }
    if (underline) {
      return 'underline';
    }
    if (strike) {
      return 'line-through';
    }
    return '';
  }

  private handleTextEdit = () => {
    const node = this.node as Konva.Text | null;
    if (!node) {
      return;
    }
    node.hide();

    const transformer = this.stage.findOne<Konva.Transformer>('Transformer');
    transformer?.hide();

    const absolutePosition = node.getAbsolutePosition();
    const containerRect = this.stage.container().getBoundingClientRect();
    const scale = node.getAbsoluteScale();

    const textarea = document.createElement('textarea');
    textarea.value = node.text();
    textarea.style.position = 'absolute';
    textarea.style.top = `${containerRect.top + absolutePosition.y - 3}px`;
    textarea.style.left = `${containerRect.left + absolutePosition.x}px`;
    textarea.style.width = `${node.width() * scale.x}px`;
    textarea.style.height = `${node.height() * scale.y}px`;
    textarea.style.fontSize = `${node.fontSize() * scale.y}px`;
    textarea.style.border = 'none';
    textarea.style.padding = '0px';
    textarea.style.margin = '0px';
    textarea.style.overflow = 'hidden';
    textarea.style.background = 'none';
    textarea.style.outline = 'none';
    textarea.style.resize = 'none';
    textarea.style.lineHeight = `${node.lineHeight()}`;
    textarea.style.fontFamily = node.fontFamily();
    textarea.style.textAlign = node.align();
    textarea.style.color = node.fill() as string;
    textarea.style.transformOrigin = 'left top';
    textarea.style.fontStyle = node.fontStyle();
    textarea.style.textDecoration = node.textDecoration();
    textarea.style.letterSpacing = `${node.letterSpacing()}px`;

    const rotation = node.rotation();
    if (rotation) {
      textarea.style.transform = `rotateZ(${rotation}deg)`;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 3}px`;
    document.body.appendChild(textarea);
    textarea.focus();

    const restore = () => {
      textarea.parentNode?.removeChild(textarea);
      window.removeEventListener('click', handleOutsideClick);
      node.show();
      transformer?.show();
      transformer?.forceUpdate();
    };

    const commitIfChanged = () => {
      const nextValue = textarea.value;
      if (nextValue !== node.text()) {
        this.updateSegment({ text: nextValue });
      }
    };

    const handleOutsideClick = (event: MouseEvent) => {
      if (event.target !== textarea) {
        commitIfChanged();
        restore();
      }
    };

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        commitIfChanged();
        restore();
      }
      if (event.key === 'Escape') {
        restore();
      }
    });

    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    });

    window.setTimeout(() => {
      window.addEventListener('click', handleOutsideClick);
    });
  };
}

export function createTextRenderer(options: BaseRendererOptions<TextSegment>): TextRenderer {
  return new TextRenderer(options);
}
