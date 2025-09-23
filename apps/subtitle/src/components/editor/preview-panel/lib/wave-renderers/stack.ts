import { WaveRenderer } from './types';

export const StackWaveRenderer: WaveRenderer = {
  id: 'stack',
  name: 'Stack',
  width: 500,
  height: 100,
  render(context, data) {
    const { bars, fftData, fill, width, height } = data;
    const gradient = context.createLinearGradient(0, 0, 10, height);
    gradient.addColorStop(0, fill);
    const barWidth = width / bars;
    const fullHeight = height;
    context.fillStyle = gradient;
    for (let index = 0; index < bars; index += 1) {
      const x = index * barWidth;
      const rectWidth = barWidth * 0.9;
      const magnitude = -((fftData[index] ?? 0) / 255) * fullHeight;
      for (let stackIndex = 0; stackIndex < 10; stackIndex += 1) {
        const y = magnitude * stackIndex * 20 + 100;
        context.fillRect(x, y, rectWidth, 1);
      }
    }
  },
};
