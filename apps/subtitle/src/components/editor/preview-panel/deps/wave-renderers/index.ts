import { BarWaveRenderer } from './bar';
import { CircleWaveRenderer } from './circle';
import { DotsWaveRenderer } from './dots';
import { FormationWaveRenderer } from './formation';
import { LineWaveRenderer } from './line';
import { MultiLineWaveRenderer } from './multi-line';
import { SiriWaveRenderer } from './siri';
import { StackWaveRenderer } from './stack';
import { WaveRenderer } from './types';

// 音频波形多样式渲染器集合（可扩展）
export const waveRenderers: Record<string, WaveRenderer> = {
  bar: BarWaveRenderer,
  circle: CircleWaveRenderer,
  dots: DotsWaveRenderer,
  formation: FormationWaveRenderer,
  line: LineWaveRenderer,
  mulitLine: MultiLineWaveRenderer,
  siri: SiriWaveRenderer,
  stack: StackWaveRenderer,
};

export type { WaveRenderer, WaveRendererData } from './types';
