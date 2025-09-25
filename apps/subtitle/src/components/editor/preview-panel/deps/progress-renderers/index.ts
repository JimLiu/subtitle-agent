import { BarProgressRenderer } from './bar';
import { CircleProgressRenderer } from './circle';
import { ProgressRenderer } from './types';

export const progressRenderers: Record<string, ProgressRenderer> = {
  bar: BarProgressRenderer,
  circle: CircleProgressRenderer,
};

export type { ProgressRenderer, ProgressRendererData } from './types';
