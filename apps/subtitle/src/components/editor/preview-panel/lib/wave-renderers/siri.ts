import { WaveRenderer } from './types';

interface CurveDefinition {
  color: string;
  supportLine?: boolean;
}

const CURVE_DEFINITIONS: CurveDefinition[] = [
  { color: '255,255,255', supportLine: true },
  { color: '15, 82, 169' },
  { color: '173, 57, 76' },
  { color: '48, 220, 155' },
];

class SiriCurve {
  private readonly GRAPH_X = 25;

  private readonly DEAD_PX = 50;

  private readonly ATT_FACTOR = 8;

  private readonly DESPAWN_FACTOR = 0.02;

  private readonly NOOFCURVES_RANGES: [number, number] = [2, 5];

  private readonly NO_OF_CURVES_RANGE: [number, number] = [2, 5];

  private readonly AMPLITUDE_RANGE: [number, number] = [0.3, 5];

  private readonly OFFSET_RANGE: [number, number] = [1, -1];

  private readonly WIDTH_RANGE: [number, number] = [3, 3];

  private readonly SPEED_RANGE: [number, number] = [0, 2];

  private readonly DESPAWN_TIMEOUT_RANGE: [number, number] = [500, 5000];

  private readonly DESPAWN_TIMEOUT_RANGES: [number, number] = [500, 5e3];

  private readonly OFFSET_RANGES: [number, number] = [1, -1];

  private readonly SPEED_RANGES: [number, number] = [0, 2];

  private readonly WIDTH_RANGES: [number, number] = [3, 3];

  private readonly AMPLITUDE_RANGES: [number, number] = [.3, 5];

  private SPEED_FACTOR = 1;

  private AMPLITUDE_FACTOR = 1;

  private ctrl = {
    speed: 0.18,
    amplitude: 3,
    width: 500,
    height: 100,
    heightMax: 50,
    color: 'red',
    ctx: null as CanvasRenderingContext2D | null,
    interpolation: {
      speed: 1,
      amplitude: 2,
    },
    pixelDepth: 0.2,
  };

  private definition: CurveDefinition;

  private noOfCurves = 0;

  private spawnAt = 0;

  private prevMaxY = 0;

  private phases: number[] = [1, 2, 3, 4, 5];

  private offsets: number[] = [3, 3, 3, 3];

  private speeds: number[] = [1, 2, 3, 4];

  private finalAmplitudes: number[] = [2, 3, 4, 5, 6];

  private widths: number[] = [5, 5, 5, 1];

  private amplitudes: number[] = [1, 2, 3, 4];

  private despawnTimeouts: number[] = [];

  private verses: number[] = [];

  constructor(definition: CurveDefinition) {
    this.definition = definition;
  }

  setSpeedFactor(value: number): void {
    this.SPEED_FACTOR = value;
  }

  draw(context: CanvasRenderingContext2D, amplitude: number): void {
    this.ctrl.ctx = context;
    context.globalAlpha = 0.7;
    context.globalCompositeOperation = 'lighter';
    if (this.spawnAt === 0) {
      this.spawn();
    }

    for (let index = 0; index < this.noOfCurves; index += 1) {
      this.amplitudes[index] = Math.min(Math.max(amplitude, 0), this.finalAmplitudes[index]);
      this.phases[index] = (this.phases[index] + this.ctrl.speed * this.speeds[index] * this.SPEED_FACTOR) % (2 * Math.PI);
    }

    let maxY = Number.NEGATIVE_INFINITY;
    const directions = [1, -1];
    directions.forEach((direction) => {
      context.beginPath();
      for (let position = -this.GRAPH_X; position <= this.GRAPH_X; position += this.ctrl.pixelDepth) {
        const x = this.xPos(position);
        const y = this.ctrl.heightMax - direction * this.yPos(position);
        context.lineTo(x, y);
        maxY = Math.max(maxY, y);
      }
      context.fillStyle = `rgba(${this.definition.color}, 1)`;
      context.strokeStyle = `rgba(${this.definition.color}, 1)`;
      context.fill();
    });

    if (maxY < this.DEAD_PX && this.prevMaxY > maxY) {
      this.spawnAt = 0;
    }
    this.prevMaxY = maxY;
  }

  private spawn(): void {
    this.spawnAt = Date.now();
    this.noOfCurves = Math.floor(this.randomRange(this.NOOFCURVES_RANGES));
    this.phases = this.createArray(this.noOfCurves);
    this.offsets = this.createArray(this.noOfCurves);
    this.speeds = this.createArray(this.noOfCurves);
    this.finalAmplitudes = this.createArray(this.noOfCurves);
    this.widths = this.createArray(this.noOfCurves);
    this.amplitudes = this.createArray(this.noOfCurves);
    this.despawnTimeouts = this.createArray(this.noOfCurves);
    this.verses = this.createArray(this.noOfCurves);
    for (let index = 0; index < this.noOfCurves; index += 1) {
      this.spawnSingle(index);
    }
  }

  private spawnSingle(index: number): void {
    this.phases[index] = 0;
    this.despawnTimeouts[index] = this.randomRange(this.DESPAWN_TIMEOUT_RANGES);
    this.offsets[index] = this.randomRange(this.OFFSET_RANGES);
    this.speeds[index] = this.randomRange(this.SPEED_RANGES);
    this.finalAmplitudes[index] = this.randomRange(this.AMPLITUDE_RANGES);
    this.widths[index] = this.randomRange(this.WIDTH_RANGES);
    this.verses[index] = this.randomRange([-1, 1]);
  }

  private createArray(length: number): number[] {
    return new Array<number>(length);
  }

  private randomRange([min, max]: [number, number]): number {
    return min + Math.random() * (max - min);
  }

  private globalAttenuation(position: number): number {
    return (this.ATT_FACTOR / (this.ATT_FACTOR + position ** 2)) ** this.ATT_FACTOR;
  }

  private sin(position: number, phase: number): number {
    return Math.sin(position - phase);
  }

  private yRelative(position: number): number {
    let sum = 0;
    for (let index = 0; index < this.noOfCurves; index += 1) {
      let offset = (4 * (index / (this.noOfCurves - 1) * 2 - 1));
      offset += this.offsets[index];
      const innerPosition = position * (1 / this.widths[index]) - offset;
      sum += Math.abs(this.amplitudes[index] * this.sin(this.verses[index] * innerPosition, this.phases[index]) * this.globalAttenuation(innerPosition));
    }
    return sum / this.noOfCurves;
  }

  private yPos(position: number): number {
    return this.AMPLITUDE_FACTOR * this.ctrl.heightMax * this.ctrl.amplitude * this.yRelative(position) * this.globalAttenuation(position / this.GRAPH_X * 2);
  }

  private xPos(position: number): number {
    return this.ctrl.width * ((position + this.GRAPH_X) / (2 * this.GRAPH_X));
  }
}

const curves = CURVE_DEFINITIONS.map((definition) => new SiriCurve(definition));

export const SiriWaveRenderer: WaveRenderer = {
  id: 'siri',
  name: 'Siri',
  width: 500,
  height: 100,
  render(context, data) {
    const lastValue = data.fftData[data.fftData.length - 1] as number | false;
    const speedFactor = lastValue === false ? 0 : 1;
    curves.forEach((curve, index) => {
      curve.setSpeedFactor(speedFactor);
      curve.draw(context, data.fftData[index] ?? 0);
    });
  },
};
