import { WaveRenderer } from './types';

// 柱状波形：按等宽条绘制 FFT 幅值
function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number,
): void {
  let radius = cornerRadius;
  if (width < 2 * radius) {
    radius = width / 2;
  }
  if (height < 2 * radius) {
    radius = height / 2;
  }
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.fill();
  context.closePath();
}

export const BarWaveRenderer: WaveRenderer = {
  id: 'bar',
  name: 'Bar',
  width: 500,
  height: 100,
  render(context, data) {
    const { bars, fftData, fill, width, height, corners = 0 } = data;
    const barWidth = width / bars;
    for (let index = 0; index < bars; index += 1) {
      context.fillStyle = fill;
      const x = index * barWidth;
      const rectWidth = barWidth * 0.75;
      const magnitude = (fftData[index] ?? 0) * height;
      drawRoundedRect(context, x, height - magnitude, rectWidth, magnitude, corners);
    }
  },
};
