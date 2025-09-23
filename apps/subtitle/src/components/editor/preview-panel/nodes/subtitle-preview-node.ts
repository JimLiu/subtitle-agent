import Konva from 'konva';
import WebFont from 'webfontloader';

import { PreviewKonvaNode } from './preview-konva-node';
import { TextElement } from '@/types/timeline';

export class SubtitlePreviewNode extends PreviewKonvaNode<TextElement> {
  private animationId: number | null = null;

  protected async initKonvaObject(): Promise<void> {
    const element = this.element;
    if (!element) {
      return;
    }

    const fontFamily = element.font?.family;
    if (fontFamily) {
      WebFont.load({
        google: {
          families: [fontFamily],
        },
      });
    }

    const options = element.options;
    const shadowColor = options?.shadowColor ? options.shadowColor.substring(0, 7) : '';
    const shadowOpacity = options?.shadowColor ? parseInt(options.shadowColor.substring(7, 9), 16) / 255 : 1;
    const fontStyle = element.fontWeight === "bold" && element.fontStyle === "italic" 
      ? 'italic bold'
      : element.fontWeight === "bold"
        ? 'bold'
        : element.fontStyle === "italic"
          ? 'italic'
          : 'normal';

    this.konvaObject = new Konva.Text({
      text: '',
      x: element.x ?? 0,
      y: element.y ?? 0,
      fill: element.color as string,
      opacity: element.opacity,
      rotation: element.rotation,
      scaleX: element.scale?.x ?? 1,
      scaleY: element.scale?.y ?? 1,
      width: element.width ?? 100,
      height: element.height === "auto" ? undefined : element.height ?? 100,
      fontSize: element.fontSize ?? 20,
      letterSpacing: element.letterSpacing ?? 0,
      align: element.textAlign ?? 'left',
      lineHeight: element.lineHeight ?? 1,
      fontFamily: fontFamily ?? '',
      strokeWidth: element.strokeWidth ?? 0,
      stroke: options?.stokeColor ?? '#FFFFFF',
      shadowBlur: element.shadowBlur ?? 0,
      shadowOffsetX: element.shadowOffsetX ?? 0,
      shadowOffsetY: element.shadowOffsetY ?? 0,
      verticalAlign: element.verticalAlign ?? 'bottom',
      shadowColor,
      shadowOpacity,
      fontStyle,
      fillAfterStrokeEnabled: true,
      lineJoin: 'round',
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
        height,
        scaleX: 1,
        scaleY: 1,
      });
      this.updateSegment({
        id: this.id,
        width,
        height,
      });
    });

    const updateText = () => {
      const current = this.element;
      const node = this.konvaObject as Konva.Text | null;
      if (!current || !node) {
        this.animationId = requestAnimationFrame(updateText);
        return;
      }
      const active = current.subtitles?.segments?.find((cue) => cue.start <= this.currentTimestamp / 1000 && cue.end >= this.currentTimestamp / 1000);
      node.text(active ? active.text : '');
      this.animationId = requestAnimationFrame(updateText);
    };

    this.animationId = requestAnimationFrame(updateText);
  }

  destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    super.destroy();
  }
}
