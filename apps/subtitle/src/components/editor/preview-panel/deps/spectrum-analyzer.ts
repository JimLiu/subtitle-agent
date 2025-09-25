import AudioProcessor from './audio-processor';
import { FFT_SIZE } from './constants';
import { computeFftMagnitudes } from './fft';
import { blackmanWindow } from './blackman-window';
import { db2mag, mag2db, normalize } from './math-utils';
import { mixdownBuffer } from './audio-mixdown';
import { updateExistingProps } from './object-utils';

export interface SpectrumAnalyzerProperties {
  fftSize: number;
  minDecibels: number;
  maxDecibels: number;
  smoothingTimeConstant: number;
}

export class SpectrumAnalyzer extends AudioProcessor<SpectrumAnalyzerProperties> {
  public readonly audioContext: AudioContext;

  public readonly analyzer: AnalyserNode;

  public fft: Uint8Array;

  public td: Float32Array;

  private blackmanTable: Float32Array;

  private buffer: AudioBuffer;

  private smoothing: Float32Array;

  constructor(context: AudioContext, properties?: Partial<SpectrumAnalyzerProperties>) {
    super('SpectrumAnalyzer', {
      ...SpectrumAnalyzer.defaultProperties,
      ...(properties ?? {}),
    });
    this.audioContext = context;
    this.analyzer = Object.assign(context.createAnalyser(), this.properties);
    this.fft = new Uint8Array(this.analyzer.fftSize / 2);
    this.td = new Float32Array(this.analyzer.fftSize);
    this.blackmanTable = new Float32Array(this.analyzer.fftSize);
    this.buffer = context.createBuffer(1, this.analyzer.fftSize, context.sampleRate);
    this.smoothing = new Float32Array(this.analyzer.fftSize / 2);
    this.init();
  }

  update(properties: Partial<SpectrumAnalyzerProperties>): boolean {
    const changed = super.update(properties);
    if (changed) {
      if (properties) {
        updateExistingProps(this.analyzer as unknown as Record<string, unknown>, properties as Record<string, unknown>);
      }
      if (properties?.fftSize !== undefined) {
        this.init();
      }
    }
    return changed;
  }

  init(): void {
    const { fftSize } = this.analyzer;
    this.fft = new Uint8Array(fftSize / 2);
    this.td = new Float32Array(fftSize);
    this.blackmanTable = new Float32Array(fftSize);
    for (let index = 0; index < fftSize; index += 1) {
      this.blackmanTable[index] = blackmanWindow(index, fftSize);
    }
    this.buffer = this.audioContext.createBuffer(1, fftSize, this.audioContext.sampleRate);
    this.smoothing = new Float32Array(fftSize / 2);
  }

  get gain(): number {
    return this.fft.reduce((sum, value) => sum + value, 0) / this.fft.length;
  }

  getFloatTimeDomainData(target: Float32Array): void {
    target.set(this.buffer.getChannelData(0));
  }

  getFloatFrequencyData(target: Float32Array): void {
    const { fftSize, smoothingTimeConstant } = this.analyzer;
    const working = new Float32Array(fftSize);
    this.getFloatTimeDomainData(working);
    for (let index = 0; index < fftSize; index += 1) {
      working[index] *= this.blackmanTable[index] || 0;
    }
    const magnitudes = computeFftMagnitudes(working);
    for (let index = 0, half = fftSize / 2; index < half; index += 1) {
      let magnitude = mag2db(magnitudes[index]);
      if (smoothingTimeConstant) {
        this.smoothing[index] = magnitudes[index] * smoothingTimeConstant * this.smoothing[index] + (1 - smoothingTimeConstant);
        magnitude = mag2db(this.smoothing[index]);
      }
      target[index] = Number.isFinite(magnitude) ? magnitude : Number.NEGATIVE_INFINITY;
    }
  }

  getByteTimeDomainData(target: Uint8Array): void {
    const { fftSize } = this.analyzer;
    const buffer = new Float32Array(fftSize);
    this.getFloatTimeDomainData(buffer);
    for (let index = 0; index < buffer.length; index += 1) {
      target[index] = Math.round(255 * normalize(buffer[index], -1, 1));
    }
  }

  getByteFrequencyData(target: Uint8Array): void {
    const { minDecibels, maxDecibels, frequencyBinCount } = this.analyzer;
    const buffer = new Float32Array(frequencyBinCount);
    this.getFloatFrequencyData(buffer);
    for (let index = 0; index < buffer.length; index += 1) {
      target[index] = Math.round(255 * normalize(buffer[index], minDecibels, maxDecibels));
    }
  }

  process(inputBuffer?: AudioBuffer): void {
    if (inputBuffer) {
      const mixed = mixdownBuffer(inputBuffer);
      this.buffer.copyToChannel(mixed, 0);
    }
    this.updateTimeData(inputBuffer);
    this.updateFrequencyData(inputBuffer);
  }

  updateFrequencyData(inputBuffer?: AudioBuffer): void {
    if (inputBuffer) {
      this.getByteFrequencyData(this.fft);
    } else {
      this.analyzer.getByteFrequencyData(this.fft);
    }
  }

  updateTimeData(inputBuffer?: AudioBuffer): void {
    if (inputBuffer) {
      this.getFloatTimeDomainData(this.td);
    } else {
      this.analyzer.getFloatTimeDomainData(this.td);
    }
  }

  reset(): void {
    this.fft.fill(0);
    this.td.fill(0);
    this.smoothing.fill(0);
  }

  static defaultProperties: SpectrumAnalyzerProperties = {
    fftSize: FFT_SIZE,
    minDecibels: -100,
    maxDecibels: 0,
    smoothingTimeConstant: 0,
  };
}
