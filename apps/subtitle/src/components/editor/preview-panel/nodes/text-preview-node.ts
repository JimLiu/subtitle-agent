import Konva from 'konva';
import WebFont from 'webfontloader';

import { PreviewKonvaNode } from './preview-konva-node';
import { TextElement } from '@/types/timeline';

export class TextPreviewNode extends PreviewKonvaNode<TextElement> {
  protected initKonvaObject(): void {
    const element = this.element;
    if (!element) {
      return;
    }

    const fontFamily = element.font?.family ?? 'Arial, sans-serif';
    this.loadFont(fontFamily);

    const shadowColor = element.options?.shadowColor ? element.options.shadowColor.substring(0, 7) : '';
    const shadowOpacity = element.options?.shadowColor
      ? (parseInt(element.options.shadowColor.substring(7, 9), 16) - 0) / 255
      : 1;
    const fontStyle = element.fontWeight === "bold" && element.fontStyle === "italic"
      ? 'italic bold'
      : element.fontWeight === "bold"
        ? 'bold'
        : element.fontStyle === "italic"
          ? 'italic'
          : 'normal';
    const decoration = element.textDecoration === "underline-line-through"
      ? 'underline line-through'
      : element.textDecoration === "underline"
        ? 'underline'
        : element.textDecoration === "line-through"
          ? 'line-through'
          : '';

    this.konvaObject = new Konva.Text({
      id: element.id,
      text: element.content ?? '',
      x: element.x ?? 0,
      y: element.y ?? 0,
      fill: element.color as string,
      opacity: element.opacity,
      rotation: element.rotation,
      scaleX: element.scale?.x ?? 1,
      scaleY: element.scale?.y ?? 1,
      width: element.width ?? 100,
      // height: 'auto',
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
      shadowColor,
      shadowOpacity,
      fontStyle,
      fillAfterStrokeEnabled: true,
      lineJoin: 'round',
      textDecoration: decoration,
    });

    this.konvaObject.on('dblclick dbltap', () => {
      this.handleTextEdit();
    });

    this.konvaObject.on('transform', () => {
      const node = this.konvaObject as Konva.Text | null;
      if (!node) {
        return;
      }
      const width = Math.max(node.width() * node.scaleX(), 30);
      const height = Math.max(node.height() * node.scaleY(), 30);
      node.setAttrs({
        width,
        height: 'auto',
        scaleX: 1,
        scaleY: 1,
      });
      this.updateSegment({
        id: this.id,
        width,
        height,
      });
    });
  }

  protected onSegmentUpdated(newSegment: TextElement | null, previousSegment: TextElement | null): void {
    if (!newSegment) {
      return;
    }
    const prevFont = previousSegment?.font?.family;
    const nextFont = newSegment.font?.family;
    if (nextFont && nextFont !== prevFont) {
      this.loadFont(nextFont);
    }
  }

  private loadFont(family: string): void {
    WebFont.load({
      google: {
        families: [family],
      },
      active: () => {
        const node = this.konvaObject as Konva.Text | null;
        if (node) {
          node.fontFamily(family);
          node.getLayer()?.batchDraw();
        }
      },
      inactive: () => {
        const node = this.konvaObject as Konva.Text | null;
        if (node) {
          node.fontFamily('Arial, sans-serif');
          node.getLayer()?.batchDraw();
        }
      },
      timeout: 5000,
    });
  }

  private handleTextEdit(): void {
    const node = this.konvaObject as Konva.Text | null;
    if (!node) {
      return;
    }
    node.hide();
    const transformer = node.getStage()?.findOne('Transformer') as Konva.Transformer | undefined;
    transformer?.hide();

    const absolutePosition = node.absolutePosition();
    const containerRect = node.getStage()?.container().getBoundingClientRect();
    if (!containerRect) {
      return;
    }

    const scale = node.getAbsoluteScale();
    const textarea = document.createElement('textarea');
    textarea.value = node.text();
    Object.assign(textarea.style, {
      position: 'absolute',
      top: `${containerRect.top + absolutePosition.y - 3}px`,
      left: `${containerRect.left + absolutePosition.x}px`,
      width: `${node.width() * scale.x}px`,
      height: `${node.height() * scale.y}px`,
      fontSize: `${node.fontSize() * scale.y}px`,
      border: 'none',
      padding: '0px',
      margin: '0px',
      overflow: 'hidden',
      background: 'none',
      outline: 'none',
      resize: 'none',
      lineHeight: `${node.lineHeight()}`,
      fontFamily: node.fontFamily(),
      textAlign: node.align(),
      color: node.fill(),
      transformOrigin: 'left top',
      fontStyle: node.fontStyle(),
      textDecoration: node.textDecoration(),
      letterSpacing: `${node.letterSpacing()}px`,
      zIndex: '1000',
    } as CSSStyleDeclaration);

    const rotation = node.rotation();
    let transform = '';
    if (rotation) {
      transform += `rotateZ(${rotation}deg)`;
    }
    textarea.style.transform = transform;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 3}px`;
    document.body.appendChild(textarea);
    textarea.focus();

    const remove = () => {
      textarea.parentNode?.removeChild(textarea);
      window.removeEventListener('click', handleOutsideClick);
      node.show();
      transformer?.show();
      transformer?.forceUpdate();
    };

    const handleOutsideClick = (event: MouseEvent) => {
      if (event.target !== textarea) {
        this.commitText(node, textarea.value);
        remove();
      }
    };

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.commitText(node, textarea.value);
        remove();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        remove();
      }
    });

    textarea.addEventListener('blur', () => {
      this.commitText(node, textarea.value);
      remove();
    });

    window.addEventListener('click', handleOutsideClick);
  }

  private commitText(node: Konva.Text, value: string): void {
    node.text(value);
    this.updateSegment({ id: this.id, content: value });
  }
}
