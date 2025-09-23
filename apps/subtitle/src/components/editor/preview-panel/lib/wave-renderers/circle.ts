import { WaveRenderer } from './types';

export const CircleWaveRenderer: WaveRenderer = {
  id: 'circle',
  name: 'Circle',
  width: 500,
  height: 500,
  render(context, data) {
    const { bars, fftData, fill, width, height } = data;
    const centerY = height / 2;
    const centerX = width / 2;
    const step = (2 * Math.PI) / bars;
    let angle = 1;
    const gradient = context.createLinearGradient(-2 * centerX, -2 * centerY, 2 * centerX, 2 * centerY);
    gradient.addColorStop(0, fill);
    gradient.addColorStop(1, fill);
    const values = fftData.length > 0 ? Array.from(fftData) : [0];
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const mapMagnitude = (value: number) => {
      if (maxValue === minValue) {
        return 1;
      }
      return 1 + ((value - minValue) * (1.5 - 1)) / (maxValue - minValue);
    };
    for (let index = 0; index < bars; index += 1) {
      context.beginPath();
      const sin = Math.sin(angle) * (0.5 * centerY);
      const cos = Math.cos(angle) * (0.5 * centerX);
      const magnitude = mapMagnitude(fftData[index] ?? 0);
      const distance = Math.min(centerY, centerX);
      context.lineWidth = 3;
      context.moveTo(sin + distance, cos + distance);
      context.lineTo(sin * magnitude + distance, distance + cos * magnitude);
      context.lineCap = 'round';
      context.strokeStyle = gradient;
      context.stroke();
      angle += step;
    }
  },
};
