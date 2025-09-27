import { BarProgressRenderer } from './bar';
import { CircleProgressRenderer } from './circle';
import { ProgressRenderer } from './types';

// 不同风格的进度条渲染器集合（按键选择实现）
export const progressRenderers: Record<string, ProgressRenderer> = {
  bar: BarProgressRenderer,
  circle: CircleProgressRenderer,
};

export type { ProgressRenderer, ProgressRendererData } from './types';
