import { WaveRenderer } from './types';

// 折线/平滑曲线波形：基于均匀采样点构建一条平滑路径
function slope(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (b.y - a.y) / (b.x - a.x);
}

export const LineWaveRenderer: WaveRenderer = {
  id: 'line',
  name: 'Line',
  width: 500,
  height: 100,
  render(context, data) {
    const points = (() => {
      const fft = data.fftData.slice(0, Math.floor(0.5 * data.fftData.length));
      const count = fft.length;
      const step = data.width / count;
      return fft.map((value, index) => ({
        x: index * step,
        y: value * data.height * -1 + data.height,
      }));
    })();

    context.setLineDash([0]);
    context.lineWidth = 2;

    const drawSmoothLine = (
      curve: Array<{ x: number; y: number }>,
      alpha = 0.3,
      beta = 0.6,
    ) => {
      const { fill } = data;
      const ctx = context;
      ctx.strokeStyle = fill;
      ctx.beginPath();
      ctx.moveTo(curve[0].x, curve[0].y);
      let dxPrev = 0;
      let dyPrev = 0;
      let dx = 0;
      let dy = 0;
      for (let index = 1; index < curve.length; index += 1) {
        const current = curve[index];
        const next = curve[index + 1];
        if (next) {
          const m = slope(curve[index - 1], next);
          dx = (next.x - current.x) * -alpha;
          dy = dx * m * beta;
        } else {
          dx = 0;
          dy = 0;
        }
        ctx.bezierCurveTo(
          curve[index - 1].x - dxPrev,
          curve[index - 1].y - dyPrev,
          current.x + dx,
          current.y + dy,
          current.x,
          current.y,
        );
        dxPrev = dx;
        dyPrev = dy;
      }
      ctx.stroke();
    };

    drawSmoothLine(points, 0.3, 1);
  },
};
