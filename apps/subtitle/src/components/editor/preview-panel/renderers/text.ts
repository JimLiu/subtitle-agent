import Konva from 'konva';
import WebFont from 'webfontloader';

import { TextElement } from "@/types/timeline";

import { BaseRenderer, BaseRendererOptions } from './base';

interface ShadowProps {
  color: string;
  opacity: number;
}

// 解析 #RRGGBBAA 形式的阴影颜色，返回纯色与透明度两部分
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

export class TextRenderer extends BaseRenderer<TextElement> {
  private currentFontFamily?: string;

  constructor(options: BaseRendererOptions<TextElement>) {
    super(options);
    this.currentFontFamily = options.element.font?.family;
  }

  protected createNode(): Konva.Text {
    const element = this.element;
    const fontFamily = element.font?.family ?? 'Arial, sans-serif';
    this.loadFont(fontFamily);

    const shadow = parseShadowColor(element.options?.shadowColor);

    return new Konva.Text({
      id: element.id,
      text: element.content ?? '',
      x: element.x ?? 0,
      y: element.y ?? 0,
      fill: element.color ?? '#ffffff',
      opacity: element.opacity,
      rotation: element.rotation,
      scaleX: element.scale?.x ?? 1,
      scaleY: element.scale?.y ?? 1,
      width: element.width ?? 100,
      fontSize: element.fontSize ?? 20,
      letterSpacing: element.letterSpacing ?? 0,
      align: element.textAlign ?? 'left',
      lineHeight: element.lineHeight ?? 1,
      fontFamily,
      strokeWidth: element.strokeWidth ?? 0,
      stroke: element.options?.stokeColor ?? '#FFFFFF',
      shadowBlur: element.shadowBlur ?? 0,
      shadowOffsetX: element.shadowOffsetX ?? 0,
      shadowOffsetY: element.shadowOffsetY ?? 0,
      verticalAlign: element.verticalAlign ?? 'middle',
      shadowColor: shadow?.color,
      shadowOpacity: shadow?.opacity,
      fontStyle: this.getFontStyle(element),
      textDecoration: this.getTextDecoration(element),
      fillAfterStrokeEnabled: true,
      lineJoin: 'round',
    });
  }

  protected onNodeReady(node: Konva.Node): void {
    if (!(node instanceof Konva.Text)) {
      return;
    }
    // 双击进入 DOM 文本编辑模式
    node.on('dblclick dbltap', this.handleTextEdit);
  }

  protected onElementUpdated(element: TextElement, _previous: TextElement): void {
    const node = this.node as Konva.Text | null;
    if (!node) {
      return;
    }

    if (element.content !== undefined) {
      node.text(element.content ?? '');
    }
    if (element.width !== undefined) {
      node.width(element.width ?? node.width());
    }
    if (typeof element.height === 'number') {
      node.height(element.height);
    }
    if (element.fontSize !== undefined) {
      node.fontSize(element.fontSize ?? node.fontSize());
    }
    if (element.letterSpacing !== undefined) {
      node.letterSpacing(element.letterSpacing ?? 0);
    }
    if (element.textAlign !== undefined) {
      node.align(element.textAlign ?? 'left');
    }
    if (element.lineHeight !== undefined) {
      node.lineHeight(element.lineHeight ?? 1);
    }
    if (element.strokeWidth !== undefined) {
      node.strokeWidth(element.strokeWidth ?? 0);
    }
    if (element.shadowBlur !== undefined) {
      node.shadowBlur(element.shadowBlur ?? 0);
    }
    if (element.shadowOffsetX !== undefined) {
      node.shadowOffsetX(element.shadowOffsetX ?? 0);
    }
    if (element.shadowOffsetY !== undefined) {
      node.shadowOffsetY(element.shadowOffsetY ?? 0);
    }
    if (element.verticalAlign !== undefined) {
      node.verticalAlign(element.verticalAlign ?? node.verticalAlign());
    }

    const shadow = parseShadowColor(element.options?.shadowColor);
    if (shadow) {
      node.shadowColor(shadow.color);
      node.shadowOpacity(shadow.opacity);
    } else if (!element.options?.shadowColor) {
      node.shadowOpacity(0);
    }

    if (element.options && Object.prototype.hasOwnProperty.call(element.options, 'stokeColor')) {
      node.stroke(element.options.stokeColor ?? '#FFFFFF');
    }

    if (element.color) {
      node.fill(element.color ?? '#ffffff');
    }

    node.fontStyle(this.getFontStyle(element));
    node.textDecoration(this.getTextDecoration(element));

    const nextFont = element.font?.family;
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
    this.updateElement({ width, height });
    return false;
  }

  protected onDestroy(): void {
    const node = this.node as Konva.Text | null;
    node?.off('dblclick dbltap', this.handleTextEdit);
  }

  private loadFont(family: string): void {
    // 通过 WebFontLoader 异步加载字体，失败时回退到通用字体
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

  private getFontStyle(element: TextElement): string {
    const parts: string[] = [];
    if (element.fontStyle === 'italic') {
      parts.push('italic');
    }
    if (element.fontWeight === 'bold') {
      parts.push('bold');
    }
    if (!parts.length) {
      return 'normal';
    }
    return parts.join(' ');
  }

  private getTextDecoration(element: TextElement): string {
    const decoration = element.textDecoration ?? 'none';
    if (decoration === 'underline-line-through') {
      return 'underline line-through';
    }
    if (decoration === 'none') {
      return '';
    }
    return decoration;
  }

  private handleTextEdit = () => {
    // 将 Konva 文本节点转换为可编辑 textarea（定位于同一屏幕位置）
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
        this.updateElement({ content: nextValue });
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

export function createTextRenderer(options: BaseRendererOptions<TextElement>): TextRenderer {
  return new TextRenderer(options);
}
