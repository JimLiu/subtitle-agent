import { WaveRenderer } from './types';

// 多重正弦曲线波形：叠加多条相位不同的曲线，营造“丝滑”效果
const RESOLUTION = 4;
const ATTENUATION = 0.8;
let phaseOffset = 1;
let amplitudeMultiplier = 1;
let speedMultiplier = 1;
let baseAmplitude = 50;
let speed = 1;

function waveform(input: number): number {
  const numerator = RESOLUTION;
  const denominator = RESOLUTION + input ** RESOLUTION;
  const envelope = (numerator / denominator) ** RESOLUTION;
  return ATTENUATION * envelope * baseAmplitude * amplitudeMultiplier * (1 / speed) * Math.sin(speedMultiplier * input - phaseOffset);
}

function drawLine(increment: number, context: CanvasRenderingContext2D): void {
  context.beginPath();
  for (let x = -2; x <= 2; x += 0.01) {
    const scaledX = 125 * x + 250;
    let y = waveform(x) + 50;
    phaseOffset = (phaseOffset + (Math.PI / 2) * increment) % (2 * Math.PI);
    context.lineTo(scaledX, y);
  }
  context.stroke();
}

export const MultiLineWaveRenderer: WaveRenderer = {
  id: 'mulitLine',
  name: 'MULTILINE',
  width: 500,
  height: 100,
  render(context, data) {
    const { fftData, fill } = data;
    phaseOffset += 0.01;
    context.strokeStyle = fill;
    context.lineWidth = 2;
    for (let index = 0; index < 5; index += 1) {
      speedMultiplier = 10 * (fftData[index * 10] ?? 0);
      drawLine(0.05, context);
    }
  },
};
