import Konva from 'konva';

import { TextElement } from "@/types/timeline";

import { BaseRendererOptions, RendererFrameInfo } from './base';
import { TextRenderer } from './text';

/**
 * 字幕渲染器：基于 TextRenderer，按当前时间匹配字幕段并切换文本显示。
 */
export class SubtitleRenderer extends TextRenderer {
  protected createNode(): Konva.Text {
    const node = super.createNode() as Konva.Text;
    node.text('');
    node.verticalAlign(this.element.verticalAlign ?? 'bottom');
    return node;
  }

  protected onFrame(_info: RendererFrameInfo): void {
    const node = this.node as Konva.Text | null;
    if (!node) {
      return;
    }
    const cues = this.element.subtitles?.elements ?? [];
    const timestampSeconds = this.currentTimestamp;
    const active = cues.find((cue) => cue.start <= timestampSeconds && cue.end >= timestampSeconds);
    const nextText = active?.text ?? '';
    if (node.text() !== nextText) {
      node.text(nextText);
    }
  }

  protected onElementUpdated(element: TextElement, previous: TextElement): void {
    super.onElementUpdated(element, previous);
    const node = this.node as Konva.Text | null;
    if (!node) {
      return;
    }
    if (element.verticalAlign !== previous.verticalAlign && element.verticalAlign) {
      node.verticalAlign(element.verticalAlign);
    }
  }
}

export function createSubtitleRenderer(options: BaseRendererOptions<TextElement>): SubtitleRenderer {
  return new SubtitleRenderer(options);
}
