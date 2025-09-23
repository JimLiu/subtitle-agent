import Konva from 'konva';

import { SpectrumAnalyzer } from '../lib/spectrum-analyzer';
import { FFT_SIZE } from '../lib/constants';
import { FftParser } from '../lib/fft-parser';
import { waveRenderers } from '../lib/wave-renderers';
import { PreviewKonvaNode, PreviewKonvaNodeConstructorOptions } from './preview-konva-node';
import { WaveElement } from '@/types/timeline';

interface WavePreviewNodeOptions extends PreviewKonvaNodeConstructorOptions<WaveElement> {
  audioContext?: AudioContext | null;
  analyzer?: SpectrumAnalyzer | null;
}

export class WavePreviewNode extends PreviewKonvaNode<WaveElement> {
  private readonly audioContext?: AudioContext | null;

  private readonly analyzer?: SpectrumAnalyzer | null;

  private animationId: number | null = null;

  constructor(options: WavePreviewNodeOptions) {
    super(options);
    this.audioContext = options.audioContext ?? null;
    this.analyzer = options.analyzer ?? null;
  }

  protected initKonvaObject(): void {
    const element = this.element;
    if (!element) {
      return;
    }

    const placeholder: number[] = [];
    for (let index = 0; index < FFT_SIZE / 2; index += 1) {
      const quarter = FFT_SIZE / 4;
      const amplitude = Math.sin(index / (quarter / (2 * Math.PI))) * 100;
      placeholder[index] = (amplitude + (255 - 100)) / 255;
    }

    this.konvaObject = new Konva.Rect({
      x: element.x ?? 0,
      y: element.y ?? 0,
      fill: element.color,
      opacity: element.opacity,
      rotation: element.rotation,
      scaleX: element.scale?.x ?? 1,
      scaleY: element.scale?.y ?? 1,
      width: element.width ?? 100,
      height: element.height ?? 100,
      bars: element.bars ?? 64,
      corners: element.corners ?? 20,
      fftData: [],
      draggable: true,
      name: element.id,
      hitFunc: function hitFunction(this: Konva.Rect, context: Konva.Context) {
        context.beginPath();
        context.rect(0, 0, this.width(), this.height());
        context.closePath();
        context.fillStrokeShape(this);
      },
      sceneFunc: (context, shape) => {
        const corners = shape.getAttr('corners');
        const bars = shape.getAttr('bars');
        const rectHeight = shape.getAttr('height');
        const rectWidth = shape.getAttr('width');
        const fill = shape.getAttr('fill') ?? '#000000';
        let fftData = shape.getAttr('fftData') as number[];
        const playing = shape.getAttr('playing');
        const waveType = shape.getAttr('waveType');
        const fallback = shape.getAttr('placeholderFTTData') as number[];
        if (!playing) {
          fftData = [...fallback, false] as unknown as number[];
        }
        const renderer = waveRenderers[waveType as string] ?? waveRenderers.bar;
        renderer.render(context as unknown as CanvasRenderingContext2D, {
          height: rectHeight,
          width: rectWidth,
          fill,
          fftData,
          playing,
          waveType,
          bars,
          corners,
        });
      },
    });

    this.konvaObject.setAttr('placeholderFTTData', placeholder);
    this.konvaObject.setAttr('waveType', element.wave ?? 'bar');
    this.konvaObject.setAttr('playing', this.playing);

    const parser = this.audioContext
      ? new FftParser({
          fftSize: FFT_SIZE,
          sampleRate: this.audioContext.sampleRate,
          smoothingTimeConstant: 0.8,
          minDecibels: -60,
          maxDecibels: -20,
          minFrequency: 0,
          maxFrequency: 10_000,
        })
      : null;

    const update = () => {
      this.animationId = requestAnimationFrame(update);
      const node = this.konvaObject as Konva.Rect | null;
      if (!node) {
        return;
      }
      if (this.analyzer && parser) {
        this.analyzer.process();
        const fftValues = parser.parseFft(this.analyzer.fft);
        node.setAttr('fftData', Array.from(fftValues));
      }
      node.setAttr('playing', this.playing);
    };

    this.animationId = requestAnimationFrame(update);
  }

  destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    super.destroy();
  }
}
