import Konva from 'konva';

import { TextElement } from "@/types/timeline";

import { BaseRendererOptions, RendererFrameInfo } from './base';
import { TextRenderer } from './text';

export class SubtitleRenderer extends TextRenderer {
  protected createNode(): Konva.Text {
    const node = super.createNode() as Konva.Text;
    node.text('');
    node.verticalAlign(this.segment.verticalAlign ?? 'bottom');
    return node;
  }

  protected onFrame(_info: RendererFrameInfo): void {
    const node = this.node as Konva.Text | null;
    if (!node) {
      return;
    }
    const cues = this.segment.subtitles?.segments ?? [];
    const timestampSeconds = this.currentTimestamp / 1000;
    const active = cues.find((cue) => cue.start <= timestampSeconds && cue.end >= timestampSeconds);
    const nextText = active?.text ?? '';
    if (node.text() !== nextText) {
      node.text(nextText);
    }
  }

  protected onSegmentUpdated(segment: TextElement, previous: TextElement): void {
    super.onSegmentUpdated(segment, previous);
    const node = this.node as Konva.Text | null;
    if (!node) {
      return;
    }
    if (segment.verticalAlign !== previous.verticalAlign && segment.verticalAlign) {
      node.verticalAlign(segment.verticalAlign);
    }
  }
}

export function createSubtitleRenderer(options: BaseRendererOptions<TextElement>): SubtitleRenderer {
  return new SubtitleRenderer(options);
}
