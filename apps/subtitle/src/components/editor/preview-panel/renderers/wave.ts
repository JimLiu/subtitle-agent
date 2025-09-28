import Konva from 'konva';

import { WaveElement } from "@/types/timeline";

import { FFT_SIZE } from '../deps/constants';
import { FftParser } from '../deps/fft-parser';
import { SpectrumAnalyzer } from '../deps/spectrum-analyzer';
import { waveRenderers } from '../deps/wave-renderers';
import { BaseRenderer, BaseRendererOptions, RendererFrameInfo } from './base';

export interface WaveRendererOptions extends BaseRendererOptions<WaveElement> {
  audioContext?: AudioContext;
  analyzer?: SpectrumAnalyzer;
}

/**
 * 波形渲染器：
 * - 若提供 audioContext/analyzer，则实时解析 FFT 数据并绘制；
 * - 否则使用占位数据渲染静态形态；
 * - 实际绘制由具体的 waveRenderers 实现（bar/line/circle 等）。
 */
export class WaveRenderer extends BaseRenderer<WaveElement> {
  private analyzer?: SpectrumAnalyzer;
  private parser?: FftParser;
  private readonly placeholder: number[];

  constructor(options: WaveRendererOptions) {
    super(options);
    if (options.audioContext && options.analyzer) {
      this.ensureAudioContext(options.audioContext, options.analyzer);
    } else {
      this.analyzer = options.analyzer;
    }
    this.placeholder = this.createPlaceholder();
  }

  protected createNode(): Konva.Rect {
    const element = this.element;

    const node = new Konva.Rect({
      id: element.id,
      name: element.id,
      x: element.x ?? 0,
      y: element.y ?? 0,
      fill: element.color ?? '#000000',
      opacity: element.opacity,
      rotation: element.rotation,
      scaleX: element.scale?.x ?? 1,
      scaleY: element.scale?.y ?? 1,
      width: element.width ?? 100,
      height: element.height ?? 100,
      bars: element.bars ?? 64,
      corners: element.corners ?? 20,
      fftData: [],
      waveType: element.wave ?? 'bar',
      draggable: true,
      listening: true,
      sceneFunc: (context, shape) => {
        const waveType = (shape.getAttr('waveType') as string) ?? 'bar';
        const renderer = waveRenderers[waveType] ?? waveRenderers.bar;
        const fftData = (shape.getAttr('fftData') as number[]) ?? [];
        const playing = Boolean(shape.getAttr('playing'));
        const bars = (shape.getAttr('bars') as number) ?? 64;
        const corners = (shape.getAttr('corners') as number) ?? 20;
        const width = shape.getAttr('width') as number;
        const height = shape.getAttr('height') as number;
        const fill = (shape.getAttr('fill') as string) ?? '#000000';
        const fallback = (shape.getAttr('placeholderFTTData') as number[]) ?? [];
        const data = playing ? fftData : fallback;
        renderer.render(context as unknown as CanvasRenderingContext2D, {
          width,
          height,
          fill,
          fftData: data,
          playing,
          waveType,
          bars,
          corners,
        });
      },
      hitFunc(ctx, shape) {
        const width = shape.width() ?? 0;
        const height = shape.height() ?? 0;

        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
    });

    node.setAttr('placeholderFTTData', this.placeholder);
    node.setAttr('playing', this.playing);

    return node;
  }

  protected onFrame(_info: RendererFrameInfo): void {
    const node = this.node as Konva.Rect | null;
    if (!node) {
      return;
    }

    if (this.analyzer && this.parser) {
      try {
        this.analyzer.process();
        const values = Array.from(this.parser.parseFft(this.analyzer.fft));
        node.setAttr('fftData', values);
      } catch (error) {
        console.warn('Failed to parse FFT data', error);
      }
    }

    node.setAttr('playing', this.playing);
  }

  ensureAudioContext(audioContext: AudioContext, analyzer: SpectrumAnalyzer): void {
    this.analyzer = analyzer;
    this.parser = new FftParser({
      fftSize: FFT_SIZE,
      sampleRate: audioContext.sampleRate,
      smoothingTimeConstant: 0.8,
      minDecibels: -60,
      maxDecibels: -20,
      minFrequency: 0,
      maxFrequency: 10000,
    });
  }

  protected onElementUpdated(element: WaveElement, previous: WaveElement): void {
    const node = this.node as Konva.Rect | null;
    if (!node) {
      return;
    }

    if (element.width !== previous.width && element.width) {
      node.width(element.width);
    }
    if (element.height !== previous.height && element.height) {
      node.height(element.height);
    }
    if (element.bars !== previous.bars && element.bars !== undefined) {
      node.setAttr('bars', element.bars);
    }
    if (element.corners !== previous.corners && element.corners !== undefined) {
      node.setAttr('corners', element.corners);
    }
    if (element.wave !== previous.wave && element.wave) {
      node.setAttr('waveType', element.wave);
    }

    const nextColor = element.color;
    const prevColor = previous.color;
    if (nextColor && nextColor !== prevColor) {
      node.fill(nextColor);
    }
  }

  private createPlaceholder(): number[] {
    const values: number[] = [];
    for (let index = 0; index < FFT_SIZE / 2; index += 1) {
      const quarter = FFT_SIZE / 4;
      const amplitude = Math.sin(index / (quarter / (2 * Math.PI))) * 100;
      values[index] = (amplitude + (255 - 100)) / 255;
    }
    values.push(0);
    return values;
  }
}

export function createWaveRenderer(options: WaveRendererOptions): WaveRenderer {
  return new WaveRenderer(options);
}
