import { ProgressRenderer } from './types';

// 使用圆角裁剪 + 前景/背景两层色块绘制线性进度
function clipRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  let cornerRadius = radius;
  if (width < 2 * cornerRadius) {
    cornerRadius = width / 2;
  }
  if (height < 2 * cornerRadius) {
    cornerRadius = height / 2;
  }
  context.beginPath();
  context.moveTo(x + cornerRadius, y);
  context.arcTo(x + width, y, x + width, y + height, cornerRadius);
  context.arcTo(x + width, y + height, x, y + height, cornerRadius);
  context.arcTo(x, y + height, x, y, cornerRadius);
  context.arcTo(x, y, x + width, y, cornerRadius);
  context.clip();
}

export const BarProgressRenderer: ProgressRenderer = {
  id: 'bar',
  name: 'Bar',
  render(context, data) {
    const { width, height, progress, options } = data;
    const radius = options?.radius ?? 0;
    context.save();
    clipRoundedRect(context, 0, 0, width, height, radius);
    const background = options?.innerColor ?? '#000000';
    const foreground = options?.outerColor ?? '#FFFFFF';
    const normalized = progress === 0 ? 100 : progress;
    const clampedProgress = Math.min(Math.max(normalized, 0), 100);
    const foregroundWidth = (width * clampedProgress) / 100;
    context.fillStyle = background;
    context.fillRect(foregroundWidth, 0, width - foregroundWidth, height);
    context.fillStyle = foreground;
    context.fillRect(0, 0, foregroundWidth, height);
    context.restore();
  },
};
