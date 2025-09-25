import { ProgressRenderer } from './types';

export const CircleProgressRenderer: ProgressRenderer = {
  id: 'circle',
  name: 'Circle',
  render(context, data) {
    const { width, height, progress, options } = data;
    const centerX = width / 2;
    const centerY = height / 2;
    const step = (2 * Math.PI) / 100;
    const lineWidth = options?.lineWidth ?? 2;
    const radius = Math.min(width, height) / 2 - lineWidth / 2;
    const normalizedProgress = progress === 0 ? 100 : progress;
    const clampedProgress = Math.min(Math.max(normalizedProgress, 0), 100);

    context.save();
    context.beginPath();
    context.strokeStyle = options?.innerColor ?? '#000000';
    context.lineWidth = lineWidth;
    context.arc(centerX, centerY, radius, -Math.PI / 2 + clampedProgress * step, -Math.PI / 2, false);
    context.stroke();
    context.closePath();
    context.restore();

    context.save();
    context.beginPath();
    context.strokeStyle = options?.outerColor ?? '#FFFFFF';
    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + clampedProgress * step, false);
    context.stroke();
    context.restore();
  },
};
