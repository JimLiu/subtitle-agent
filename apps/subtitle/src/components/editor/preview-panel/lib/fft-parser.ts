import AudioProcessor from './audio-processor';
import { FFT_SIZE, SAMPLE_RATE } from './constants';
import { db2mag, floor, normalize } from './math-utils';

export interface FftParserProperties {
  fftSize: number;
  sampleRate: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
  minFrequency: number;
  maxFrequency: number;
}

export class FftParser extends AudioProcessor<FftParserProperties> {
  private startBin = 0;

  private endBin = 0;

  private totalBins = 0;

  private output?: Float32Array;

  private buffer?: Float32Array;

  constructor(properties?: Partial<FftParserProperties>) {
    super('FFTParser', {
      ...FftParser.defaultProperties,
      ...(properties ?? {}),
    });
    this.init();
  }

  init(): void {
    const { fftSize, sampleRate, minFrequency, maxFrequency } = this.properties;
    const binFrequency = sampleRate / fftSize;
    this.startBin = floor(minFrequency / binFrequency);
    this.endBin = floor(maxFrequency / binFrequency);
    this.totalBins = this.endBin - this.startBin;
  }

  update(properties: Partial<FftParserProperties>): boolean {
    const changed = super.update(properties);
    if (changed) {
      this.init();
    }
    return changed;
  }

  private getValue(sample: number): number {
    const { minDecibels, maxDecibels } = this.properties;
    const magnitude = db2mag(minDecibels * (1 - sample / 256));
    return normalize(magnitude, db2mag(minDecibels), db2mag(maxDecibels));
  }

  parseFft(input: Uint8Array, binCount?: number): Float32Array {
    const totalBins = this.totalBins;
    const targetBins = binCount ?? totalBins;

    if (!this.output || this.output.length !== targetBins) {
      this.output = new Float32Array(targetBins);
      this.buffer = new Float32Array(targetBins);
    }

    const output = this.output;
    const buffer = this.buffer!;
    const { smoothingTimeConstant } = this.properties;

    if (targetBins === totalBins) {
      for (let sourceIndex = this.startBin, targetIndex = 0; sourceIndex < this.endBin; sourceIndex += 1, targetIndex += 1) {
        output[targetIndex] = this.getValue(input[sourceIndex]);
      }
    } else if (targetBins < totalBins) {
      const ratio = totalBins / targetBins;
      for (let sourceIndex = this.startBin, targetIndex = 0; sourceIndex < this.endBin; sourceIndex += 1, targetIndex += 1) {
        const lower = Math.floor(targetIndex * ratio);
        const upper = Math.floor(lower + ratio);
        let maxMagnitude = 0;
        const step = Math.max(Math.floor(ratio / 10), 1);
        for (let bin = lower; bin < upper; bin += step) {
          const value = input[bin];
          if (value > maxMagnitude) {
            maxMagnitude = value;
          } else if (-value > maxMagnitude) {
            maxMagnitude = -value;
          }
        }
        output[targetIndex] = this.getValue(maxMagnitude);
      }
    } else {
      const ratio = targetBins / totalBins;
      for (let sourceIndex = this.startBin, targetIndex = 0; sourceIndex < this.endBin; sourceIndex += 1, targetIndex += 1) {
        const value = this.getValue(input[sourceIndex]);
        const lower = Math.floor(targetIndex * ratio);
        const upper = lower + ratio;
        for (let bin = lower; bin < upper; bin += 1) {
          output[bin] = value;
        }
      }
    }

    if (smoothingTimeConstant > 0) {
      for (let index = 0; index < targetBins; index += 1) {
        output[index] = buffer[index] * smoothingTimeConstant + output[index] * (1 - smoothingTimeConstant);
        buffer[index] = output[index];
      }
    }

    return output;
  }

  static defaultProperties: FftParserProperties = {
    fftSize: FFT_SIZE,
    sampleRate: SAMPLE_RATE,
    smoothingTimeConstant: 0.5,
    minDecibels: -100,
    maxDecibels: 0,
    minFrequency: 0,
    maxFrequency: SAMPLE_RATE / 2,
  };
}
