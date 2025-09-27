import { WaveRenderer } from './types';

// 点阵式波形：按等距圆点表现幅值大小
export const DotsWaveRenderer: WaveRenderer = {
  id: 'dots',
  name: 'Dots',
  width: 500,
  height: 100,
  render(context, data) {
    const { bars, fftData, fill, width, height } = data;
    const count = Math.min(fftData.length, bars);
    const spacing = Math.ceil(width / count);
    context.beginPath();
    for (let index = 1; index < count; index += 1) {
      context.fillStyle = fill;
      const magnitude = fftData[index] ?? 0;
      const radiusScale = magnitude > 1 ? 1 / magnitude : magnitude;
      const radius = radiusScale * Math.floor(0.5 * spacing);
      if (index * spacing < width) {
        context.arc(index * spacing, height / 2, radius, 0, 2 * Math.PI, false);
      }
    }
    context.fill();
  },
};
